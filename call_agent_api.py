#!/usr/bin/env python3
"""OpenClaw Agent API 调用脚本。

发送消息给指定 Agent，轮询等待回复。

用法:
  # 使用 API Token（从前端 系统→API 页面生成）
  python call_agent_api.py --api-token "eyJ..." --agent main --message "你好"

  # 指定 Agent ID
  python call_agent_api.py --api-token "eyJ..." --agent insurance --message "帮我分析一下保险方案"

  # 复用已有会话
  python call_agent_api.py --api-token "eyJ..." --agent main --message "继续" --session "agent:main:session-123"

  # 使用用户名密码认证（不推荐）
  python call_agent_api.py --username admin --password admin123 --agent main --message "你好"

  # 指定服务器地址
  python call_agent_api.py --base-url http://192.168.1.100:8080 --api-token "eyJ..." --agent main --message "hello"

环境变量:
  OPENCLAW_BASE_URL   — 平台网关地址（默认 http://localhost:8080）
  OPENCLAW_API_TOKEN  — API Token（从前端生成，优先使用）
  OPENCLAW_USERNAME   — 登录用户名（默认 admin，API Token 不存在时使用）
  OPENCLAW_PASSWORD   — 登录密码（默认 admin123）
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ── 配置 ──────────────────────────────────────────────────────────────

BASE_URL = os.getenv("OPENCLAW_BASE_URL", "http://localhost:8080")
API_TOKEN = os.getenv("OPENCLAW_API_TOKEN", "")
USERNAME = os.getenv("OPENCLAW_USERNAME", "admin")
PASSWORD = os.getenv("OPENCLAW_PASSWORD", "admin123")


# ── 认证 ──────────────────────────────────────────────────────────────

_jwt_cache: str | None = None


def get_jwt(base_url: str, username: str, password: str) -> str:
    """登录平台网关，获取 JWT access token。"""
    global _jwt_cache
    if _jwt_cache:
        return _jwt_cache

    url = f"{base_url}/api/auth/login"
    data = json.dumps({"username": username, "password": password}).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            _jwt_cache = result["access_token"]
            return _jwt_cache
    except HTTPError as e:
        body = e.read().decode()
        print(f"[错误] 登录失败 ({e.code}): {body}", file=sys.stderr)
        sys.exit(1)


def api_request(
    base_url: str,
    path: str,
    token: str,
    method: str = "GET",
    body: dict | None = None,
    timeout: int = 120,
) -> dict:
    """发送认证 HTTP 请求到平台网关。"""
    url = f"{base_url}{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })

    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body_text = e.read().decode()
        raise RuntimeError(f"API {method} {path} 失败 ({e.code}): {body_text}")


# ── Agent 对话 ────────────────────────────────────────────────────────


def call_agent(
    base_url: str,
    token: str,
    agent_id: str,
    message: str,
    session_key: str | None = None,
    poll_interval: float = 2.0,
    poll_timeout: float = 300.0,
    stable_seconds: float = 15.0,
) -> list[dict]:
    """发送消息给 Agent 并轮询等待回复。

    Agent 可能产生多条回复（中间夹杂工具调用），因此需要持续轮询直到
    消息数量稳定足够长时间（stable_seconds）才认为回复完成。

    Args:
        base_url:        平台网关地址
        token:           API Token 或 JWT
        agent_id:        Agent ID（如 "main", "insurance" 等）
        message:         用户消息
        session_key:     指定会话 key（为空则创建新会话）
        poll_interval:   轮询间隔（秒）
        poll_timeout:    最大等待时间（秒）
        stable_seconds:  消息数量保持不变多久后认为完成（秒）

    Returns:
        Agent 回复的消息列表 [{"role": "assistant", "content": "..."}]
    """
    if not session_key:
        session_key = f"agent:{agent_id}:session-{int(time.time() * 1000)}"

    encoded_key = session_key.replace(":", "%3A")

    # 1. 获取发送前的消息数量
    try:
        before = api_request(base_url, f"/api/openclaw/sessions/{encoded_key}", token)
        msg_count_before = len(before.get("messages", []))
    except RuntimeError:
        msg_count_before = 0

    # 2. 发送消息
    print(f"  Agent: {agent_id}")
    print(f"  Session: {session_key}")
    print(f"  消息: {message}")
    print()

    result = api_request(
        base_url,
        f"/api/openclaw/sessions/{encoded_key}/messages",
        token,
        method="POST",
        body={"message": message},
    )
    run_id = result.get("runId")
    print(f"[已发送] runId={run_id}")

    # 3. 轮询等待 Agent 回复
    start_time = time.time()
    last_count = msg_count_before
    last_change_time = time.time()
    latest_assistant_msgs: list[dict] = []

    while time.time() - start_time < poll_timeout:
        time.sleep(poll_interval)

        try:
            session = api_request(base_url, f"/api/openclaw/sessions/{encoded_key}", token)
        except RuntimeError:
            continue

        messages = session.get("messages", [])
        current_count = len(messages)

        # 检测消息数变化
        if current_count != last_count:
            last_count = current_count
            last_change_time = time.time()

        # 收集新的 assistant 消息（过滤掉空内容的中间消息）
        if current_count > msg_count_before:
            new_msgs = messages[msg_count_before:]
            latest_assistant_msgs = [
                m for m in new_msgs
                if m.get("role") == "assistant" and m.get("content", "").strip()
            ]

        # 有非空 assistant 回复 且 消息数稳定超过 stable_seconds → 完成
        if latest_assistant_msgs and (time.time() - last_change_time) >= stable_seconds:
            elapsed = time.time() - start_time
            print(f"\r[完成] {len(latest_assistant_msgs)} 条回复 ({elapsed:.1f}s)\n")
            return latest_assistant_msgs

        elapsed = int(time.time() - start_time)
        status = "思考中..." if not latest_assistant_msgs else f"已收到 {len(latest_assistant_msgs)} 条回复..."
        sys.stdout.write(f"\r[等待] Agent {status} {elapsed}s   ")
        sys.stdout.flush()

    # 超时但有部分回复，仍然返回
    if latest_assistant_msgs:
        elapsed = time.time() - start_time
        print(f"\r[超时] 返回已收到的 {len(latest_assistant_msgs)} 条回复 ({elapsed:.1f}s)\n")
        return latest_assistant_msgs

    print(f"\n[超时] 等待回复超时 ({poll_timeout}s)")
    return []


# ── 主入口 ────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="OpenClaw Agent API 调用工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--base-url", default=BASE_URL,
                        help=f"平台网关地址 (默认: {BASE_URL})")
    parser.add_argument("--api-token", default=API_TOKEN,
                        help="API Token (从前端 系统→API 页面生成)")
    parser.add_argument("--username", default=USERNAME, help="登录用户名")
    parser.add_argument("--password", default=PASSWORD, help="登录密码")

    parser.add_argument("--agent", metavar="ID", default="main",
                        help="Agent ID (默认: main)")
    parser.add_argument("--message", "-m", required=True,
                        help="要发送的消息")
    parser.add_argument("--session", help="复用已有会话 key")
    args = parser.parse_args()

    print()
    print("=" * 50)
    print("  OpenClaw Agent API")
    print("=" * 50)
    print()

    if args.api_token:
        token = args.api_token
        print("[认证] 使用 API Token\n")
    else:
        token = get_jwt(args.base_url, args.username, args.password)
        print("[认证] 登录成功\n")

    replies = call_agent(
        args.base_url, token,
        agent_id=args.agent,
        message=args.message,
        session_key=args.session,
    )

    if replies:
        for i, msg in enumerate(replies):
            content = msg.get("content", "")
            if len(replies) > 1:
                print(f"--- 回复 {i + 1} ---")
            print(content)
    else:
        print("[无回复]")


if __name__ == "__main__":
    main()
