# Star-Office-UI 集成 MultiUserClaw 可行性分析报告

> 文档日期：2026-03-12
> 项目版本：v1.0
> 分析目标：评估将 Star-Office-UI 集成到 MultiUserClaw 平台的技术可行性与最佳方案

---

## 1. Star-Office-UI 项目概述

### 1.1 项目定位

Star-Office-UI 是一个**像素风格的 AI 办公室可视化看板**，核心功能包括：

| 功能模块 | 说明 |
|---------|------|
| **状态可视化** | 6种状态（idle/writing/researching/executing/syncing/error）映射到不同办公室区域 |
| **多 Agent 协作** | 通过 Join Key 邀请其他 Agent 加入，实时查看多人状态 |
| **昨日小记** | 自动从 memory/*.md 读取工作记录展示 |
| **AI 生图装修** | 接入 Gemini API 生成自定义办公室背景 |
| **三语支持** | 中文/英文/日文一键切换 |
| **桌面宠物版** | Electron 封装，透明窗口桌面宠物 |

### 1.2 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    Star-Office-UI                       │
├─────────────────────────────────────────────────────────┤
│  Frontend (Vanilla JS)                                  │
│  ├── index.html + game.js (Phaser 游戏引擎)              │
│  ├── layout.js (坐标配置中心)                            │
│  └── 像素资产 (WebP/PNG spritesheet)                     │
├─────────────────────────────────────────────────────────┤
│  Backend (Flask Python)                                 │
│  ├── app.py (主服务, 端口 19000)                         │
│  ├── state.json (主 Agent 状态)                          │
│  ├── agents-state.json (多 Agent 状态)                   │
│  └── join-keys.json (访问控制)                           │
├─────────────────────────────────────────────────────────┤
│  Integration                                            │
│  ├── set_state.py (状态切换脚本)                         │
│  └── office-agent-push.py (访客 Agent 推送)              │
└─────────────────────────────────────────────────────────┘
```

### 1.3 核心数据模型

```json
// state.json - 主 Agent 状态
{
  "state": "idle",
  "detail": "Waiting...",
  "progress": 0,
  "updated_at": "2026-02-26T00:00:00"
}

// agents-state.json - 访客 Agent
{
  "agents": [
    {
      "agentId": "agent_xxx",
      "name": "小明的龙虾",
      "state": "writing",
      "detail": "正在整理文档",
      "area": "writing",
      "authStatus": "approved",
      "updated_at": "2026-03-12T10:30:00"
    }
  ]
}
```

### 1.4 API 端点一览

| 端点 | 方法 | 说明 |
|-----|------|------|
| `/health` | GET | 健康检查 |
| `/status` | GET | 获取主 Agent 状态 |
| `/set_state` | POST | 设置主 Agent 状态 |
| `/agents` | GET | 获取多 Agent 列表 |
| `/join-agent` | POST | 访客加入办公室 |
| `/agent-push` | POST | 访客推送状态 |
| `/leave-agent` | POST | 访客离开 |
| `/yesterday-memo` | GET | 获取昨日小记 |
| `/config/gemini` | GET/POST | Gemini API 配置 |

---

## 2. MultiUserClaw 架构回顾

### 2.1 当前架构

```
Browser (:3080)
    ↓
Platform Gateway (FastAPI :8080)
    ↓
User Containers (OpenClaw + Bridge, per-user isolation)
    ↓
LLM Providers (via Gateway proxy)
```

### 2.2 关键组件

| 组件 | 技术栈 | 职责 |
|-----|--------|------|
| **Frontend** | Vite + React + TypeScript + Tailwind | 用户界面 |
| **Gateway** | Python/FastAPI | 多租户管理、容器生命周期、LLM 代理 |
| **Bridge** | TypeScript/Node.js | 连接 Gateway 到 OpenClaw |
| **User Container** | Docker + OpenClaw | 隔离的 Agent 运行环境 |

---

## 3. 集成方案对比

### 3.1 方案一：嵌入式集成（推荐）

将 Star-Office-UI 作为 MultiUserClaw 的一个功能模块嵌入。

```
┌─────────────────────────────────────────────────────────────┐
│                    MultiUserClaw Platform                    │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)                                           │
│  ├── Dashboard                                              │
│  ├── Chat                                                   │
│  ├── Agents                                                 │
│  └── 🆕 OfficeView (嵌入 Star-Office-UI)                      │
│      ├── React wrapper component                            │
│      └── Iframe 或 直接集成 Phaser 画布                      │
├─────────────────────────────────────────────────────────────┤
│  Gateway (FastAPI)                                          │
│  ├── 现有路由...                                             │
│  └── 🆕 /api/office/* (Star-Office 状态 API)                 │
│      ├── GET  /api/office/status                            │
│      ├── POST /api/office/status                            │
│      ├── GET  /api/office/agents                            │
│      └── POST /api/office/agents/{id}/join                  │
├─────────────────────────────────────────────────────────────┤
│  User Container (per-user)                                  │
│  ├── OpenClaw Agent Engine                                  │
│  ├── Bridge                                                 │
│  └── 🆕 Office State Sync Service                           │
│      └── 自动上报状态到 Gateway                              │
└─────────────────────────────────────────────────────────────┘
```

**优点：**
- 统一认证体系，无需单独登录
- 与现有 Agent 系统深度集成
- 状态同步自动化，无需手动脚本
- 可扩展性强，可添加更多办公室场景

**缺点：**
- 需要修改现有代码
- 需要适配像素资产的部署

### 3.2 方案二：独立部署 + 桥接

保持 Star-Office-UI 独立运行，通过 API 桥接与 MultiUserClaw 通信。

```
┌─────────────────────────────────────────────────────────────┐
│                    MultiUserClaw Platform                    │
├─────────────────────────────────────────────────────────────┤
│  Frontend                    Gateway                        │
│  └── 外部链接卡片 ─────────→ 代理到 Star-Office-UI            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Star-Office-UI (独立部署)                      │
│  ├── Flask Backend (:19000)                                 │
│  └── Vanilla JS Frontend                                    │
└─────────────────────────────────────────────────────────────┘
```

**优点：**
- 零侵入，不影响现有代码
- 快速上线
- 保持 Star-Office-UI 原汁原味

**缺点：**
- 用户体验割裂（需要跳转到另一个页面）
- 需要单独维护一套认证
- 状态同步需要额外开发桥接服务

### 3.3 方案三：混合架构（最佳长期方案）

结合上述两种方案的优点：

```
Phase 1: 独立部署 (快速上线)
    - 部署 Star-Office-UI 到子域名 office.{domain}
    - Gateway 提供代理和认证透传
    - 通过 WebSocket 实时同步状态

Phase 2: 深度集成 (体验优化)
    - 开发 React 版本的 Office Dashboard
    - 保留 Phaser 像素画布作为核心展示
    - 整合到主应用的 Agent 详情页

Phase 3: 功能扩展 (生态建设)
    - 多房间支持（每个 Agent 有自己的办公室）
    - 办公室间串门功能
    - 虚拟会议/协作场景
```

---

## 4. 技术实现细节

### 4.1 状态映射设计

将 OpenClaw 的内部状态映射到 Star-Office-UI 的 6 种状态：

| OpenClaw 状态/事件 | Star-Office 状态 | 触发场景 |
|-------------------|-----------------|---------|
| `chat.idle` | `idle` | Agent 等待任务 |
| `chat.processing` | `writing` | 生成回复/写代码 |
| `tool.read` | `researching` | 读取文件/搜索 |
| `tool.edit` | `writing` | 编辑文件 |
| `tool.execute` | `executing` | 执行命令 |
| `cron.sync` | `syncing` | 定时同步 |
| `error.*` | `error` | 发生错误 |

### 4.2 数据库模型扩展

```python
# platform/app/db/models.py 新增

class OfficeState(Base):
    """用户办公室状态"""
    __tablename__ = "office_states"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    state = Column(String(20), default="idle")  # idle/writing/researching/executing/syncing/error
    detail = Column(Text, default="待命中")
    progress = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # 办公室自定义配置
    background_url = Column(String(500))
    theme = Column(String(50), default="default")

class OfficeVisitor(Base):
    """办公室访客（其他 Agent）"""
    __tablename__ = "office_visitors"

    id = Column(Integer, primary_key=True)
    host_user_id = Column(Integer, ForeignKey("users.id"))  # 被访问的用户
    visitor_agent_id = Column(String(100))  # 访客 Agent ID
    visitor_name = Column(String(100))
    state = Column(String(20))
    detail = Column(Text)
    auth_status = Column(String(20), default="pending")  # approved/pending/rejected
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_ping_at = Column(DateTime)
```

### 4.3 Gateway API 扩展

```python
# platform/app/routes/office.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import OfficeState, OfficeVisitor

router = APIRouter(prefix="/api/office", tags=["office"])

@router.get("/status")
async def get_office_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前用户的办公室状态"""
    state = await db.get(OfficeState, current_user.id)
    return {
        "state": state.state if state else "idle",
        "detail": state.detail if state else "待命中",
        "progress": state.progress if state else 0,
        "updated_at": state.updated_at.isoformat() if state else None
    }

@router.post("/status")
async def update_office_status(
    data: OfficeStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新办公室状态（由 Bridge 调用）"""
    # 实现状态更新逻辑
    pass

@router.get("/visitors")
async def get_office_visitors(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前办公室的访客列表"""
    pass

@router.post("/visitors/join")
async def join_office(
    data: JoinOfficeRequest,
    db: AsyncSession = Depends(get_db)
):
    """访客加入办公室"""
    pass

@router.post("/visitors/{agent_id}/ping")
async def ping_office_visitor(
    agent_id: str,
    data: VisitorPingRequest,
    db: AsyncSession = Depends(get_db)
):
    """访客状态心跳"""
    pass
```

### 4.4 Bridge 状态同步

```typescript
// bridge/routes/office.ts

import { Router } from "express";
import type { BridgeConfig } from "../config.js";
import type { BridgeGatewayClient } from "../gateway-client.js";

export function officeRoutes(
  client: BridgeGatewayClient,
  config: BridgeConfig
): Router {
  const router = Router();

  // 状态映射表
  const stateMapping: Record<string, string> = {
    "chat.idle": "idle",
    "chat.processing": "writing",
    "tool.read": "researching",
    "tool.edit": "writing",
    "tool.execute": "executing",
    "cron.sync": "syncing",
  };

  // 监听 OpenClaw 事件并同步到 Gateway
  client.onEvent((event) => {
    const { type, payload } = event;

    // 映射状态
    const officeState = stateMapping[type];
    if (officeState) {
      syncOfficeState({
        state: officeState,
        detail: getStateDetail(type, payload),
        timestamp: new Date().toISOString()
      });
    }

    // 错误状态特殊处理
    if (type.startsWith("error.")) {
      syncOfficeState({
        state: "error",
        detail: payload.message || "发生错误",
        timestamp: new Date().toISOString()
      });
    }
  });

  async function syncOfficeState(stateData: OfficeStateData) {
    try {
      await fetch(`${config.gatewayUrl}/api/office/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.containerToken}`
        },
        body: JSON.stringify(stateData)
      });
    } catch (err) {
      console.error("[office] Failed to sync state:", err);
    }
  }

  return router;
}
```

### 4.5 Frontend 集成

```tsx
// frontend/src/pages/Office.tsx

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Phaser from 'phaser';
import { useOfficeStore } from '@/stores/officeStore';

export const OfficePage: React.FC = () => {
  const gameContainer = useRef<HTMLDivElement>(null);
  const { userId } = useParams();
  const { status, visitors, fetchStatus } = useOfficeStore();

  useEffect(() => {
    // 初始化 Phaser 游戏
    if (!gameContainer.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1280,
      height: 720,
      parent: gameContainer.current,
      pixelArt: true,
      scene: OfficeScene,
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 } }
      }
    };

    const game = new Phaser.Game(config);

    // 定期同步状态
    const interval = setInterval(fetchStatus, 2000);

    return () => {
      clearInterval(interval);
      game.destroy(true);
    };
  }, [userId]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <div ref={gameContainer} className="w-full h-full" />

        {/* 状态覆盖层 */}
        <div className="absolute top-4 left-4 bg-black/50 text-white p-4 rounded">
          <h3 className="font-bold">当前状态</h3>
          <p>{status.state}: {status.detail}</p>
        </div>

        {/* 访客列表 */}
        <div className="absolute top-4 right-4 bg-white/90 p-4 rounded shadow">
          <h3 className="font-bold">办公室访客</h3>
          {visitors.map(v => (
            <div key={v.agentId} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                v.authStatus === 'approved' ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              <span>{v.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Phaser 场景类
class OfficeScene extends Phaser.Scene {
  private star!: Phaser.Physics.Arcade.Sprite;
  private currentState: string = 'idle';

  constructor() {
    super({ key: 'OfficeScene' });
  }

  preload() {
    // 加载 Star-Office-UI 的资产
    this.load.image('office_bg', '/assets/office/background.webp');
    this.load.spritesheet('star_idle', '/assets/office/star-idle.webp', {
      frameWidth: 128, frameHeight: 128
    });
    // ... 其他资产
  }

  create() {
    // 创建办公室场景
    this.add.image(640, 360, 'office_bg');

    // 初始化主角
    this.star = this.physics.add.sprite(640, 360, 'star_idle');

    // 创建动画
    this.anims.create({
      key: 'idle',
      frames: this.anims.generateFrameNumbers('star_idle', { start: 0, end: 29 }),
      frameRate: 12,
      repeat: -1
    });

    this.star.anims.play('idle');
  }

  update() {
    // 根据当前状态更新动画和位置
    const store = useOfficeStore.getState();
    if (store.status.state !== this.currentState) {
      this.transitionToState(store.status.state);
    }
  }

  private transitionToState(newState: string) {
    this.currentState = newState;
    // 状态切换动画逻辑
  }
}
```

---

## 5. 功能增强建议

### 5.1 核心增强

| 功能 | 描述 | 优先级 |
|-----|------|--------|
| **多房间支持** | 每个用户/Agent 可拥有独立办公室 | P0 |
| **办公室串门** | 访客可以"走进"其他用户的办公室 | P1 |
| **实时聊天** | 办公室内访客可文字交流 | P1 |
| **任务看板** | 在办公室展示当前进行中的任务 | P1 |
| **成就展示** | 展示用户的技能/成就徽章 | P2 |
| **主题市场** | 用户可以分享/下载办公室主题 | P2 |

### 5.2 与 ACP 协议结合

借鉴 AionUi 的 ACP (Agent Collaboration Protocol) 设计：

```typescript
// 办公室内的 ACP 消息扩展
interface OfficeAcpMessage {
  type: 'office.event';
  payload: {
    event: 'agent.enter' | 'agent.leave' | 'agent.state_change' | 'agent.interact';
    agentId: string;
    agentName: string;
    data: {
      fromState?: string;
      toState?: string;
      position?: { x: number; y: number };
      message?: string;
    };
    timestamp: string;
  };
}
```

### 5.3 移动端适配

```css
/* OfficeView 移动端适配 */
@media (max-width: 768px) {
  .office-container {
    transform: scale(0.5);
    transform-origin: top left;
  }

  .office-ui-overlay {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0,0,0,0.8);
    padding: 1rem;
  }
}
```

---

## 6. 实施路线图

### Phase 1: MVP (2-3 周)

**目标：** 基础功能上线，可展示单个用户状态

```
Week 1:
- [ ] Gateway 添加 OfficeState 数据模型
- [ ] 创建 /api/office/* 路由
- [ ] Bridge 添加状态同步逻辑

Week 2:
- [ ] Frontend 添加 OfficePage 组件
- [ ] 集成 Phaser.js 和 Star-Office-UI 资产
- [ ] 基础状态展示功能

Week 3:
- [ ] 测试和 Bug 修复
- [ ] 部署到测试环境
- [ ] 文档完善
```

### Phase 2: 多 Agent 支持 (2 周)

**目标：** 支持访客加入，多 Agent 协作展示

```
- [ ] OfficeVisitor 数据模型
- [ ] Join Key 生成和管理
- [ ] 访客状态同步
- [ ] 多 Agent 位置分配算法
- [ ] 访客权限管理
```

### Phase 3: 体验优化 (2 周)

**目标：** 提升用户体验，增加互动性

```
- [ ] 办公室主题切换
- [ ] 自定义角色形象
- [ ] 实时气泡对话
- [ ] 移动端适配优化
- [ ] 性能优化（WebP 支持、懒加载）
```

### Phase 4: 生态建设 (持续)

**目标：** 构建办公室社交生态

```
- [ ] 办公室串门功能
- [ ] 公共休息区（大厅）
- [ ] 主题市场
- [ ] 成就系统
- [ ] 与 Skill 系统联动
```

---

## 7. 风险评估与应对

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| **美术资产版权** | 高 | 替换为原创或无版权争议的素材 |
| **性能问题** | 中 | WebP 格式、资产懒加载、Canvas 优化 |
| **状态同步延迟** | 中 | WebSocket 实时推送、本地状态缓存 |
| **浏览器兼容性** | 低 | 提供降级方案（简化版 UI）|
| **扩展性** | 中 | 设计多房间架构，避免单点瓶颈 |

---

## 8. 结论与建议

### 8.1 可行性结论

**高度可行。** Star-Office-UI 与 MultiUserClaw 的技术栈互补性强：

1. **后端兼容**：Flask 服务可迁移到 FastAPI，数据模型可复用
2. **前端可集成**：Phaser 画布可以嵌入 React 应用
3. **状态可映射**：OpenClaw 事件可完美映射到办公室状态
4. **架构可扩展**：多租户设计天然支持多用户办公室

### 8.2 推荐方案

**采用"方案三：混合架构"**

1. **短期（1 个月）**：独立部署 + iframe 嵌入，快速验证需求
2. **中期（2-3 个月）**：深度集成到 React 前端，优化体验
3. **长期（6 个月+）**：构建办公室社交生态，成为平台差异化特性

### 8.3 下一步行动

1. **产品决策**：确认是否启动该项目，优先级排序
2. **美术资源**：评估是否需要替换/新增像素资产
3. **技术预研**：验证 Phaser 在 React 中的集成方案
4. **原型开发**：快速搭建 MVP 验证核心流程

---

## 附录

### A. 参考资源

- [Star-Office-UI GitHub](https://github.com/ringhyacinth/Star-Office-UI)
- [Phaser 3 文档](https://photonstorm.github.io/phaser3-docs/)
- [AionUi 多 Agent 架构分析](./AIONUI_MULTI_AGENT_ARCHITECTURE.md)

### B. 术语表

| 术语 | 说明 |
|-----|------|
| **Office** | 像素办公室，可视化看板 |
| **Agent** | AI 助手实例 |
| **Join Key** | 邀请其他 Agent 加入办公室的密钥 |
| **State** | Agent 当前状态（idle/writing 等）|
| **Phaser** | HTML5 游戏框架 |
| **Spritesheet** | 精灵图集，包含动画帧 |

---

> 文档版本：v1.0
> 最后更新：2026-03-12
> 维护者：MultiUserClaw Team
