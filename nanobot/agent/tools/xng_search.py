#!/usr/bin/env python
# -*- coding: utf-8 -*-
# @Date  : 2025/6/25 09:09
# @File  : weixin_search.py
# @Author: johnson
# @Contact : github: johnson7788
# @Desc  : 使用sear XNG。

import requests
from typing import Optional

def search(
        query: str,
        num_results: int = 10,
        language: str = "zh",
        categories: str = "general",
        engines: Optional[str] = None,
        time_range: Optional[str] = None,
) -> list[dict]:
    """
    使用 SearXNG 进行搜索

    Args:
        query: 搜索关键词
        num_results: 返回结果数量（默认10）
        language: 搜索语言（默认 'zh'，可选 'en', 'auto' 等）
        categories: 搜索类别（默认 'general'，可选 'images', 'news', 'videos' 等）
        engines: 指定搜索引擎（逗号分隔，如 'google,bing'，默认 None 使用所有引擎）
        time_range: 时间范围（可选 'day', 'week', 'month', 'year'）

    Returns:
        搜索结果列表，每个结果包含 title, url, content 等字段

    Raises:
        requests.RequestException: 网络请求失败时抛出
    """
    base_url = "http://8.219.115.209:8888/search"

    params = {
        "q": query,
        "format": "json",
        "language": language,
        "categories": categories,
        "safesearch": 0, #        safesearch: 安全搜索级别（0=关闭, 1=适中, 2=严格）
    }

    if engines:
        params["engines"] = engines
    if time_range:
        params["time_range"] = time_range

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; PythonSearchBot/1.0)",
        "Accept": "application/json",
    }

    response = requests.get(
        base_url,
        params=params,
        headers=headers,
        timeout=30
    )
    response.raise_for_status()

    data = response.json()
    results = data.get("results", [])

    # 格式化并限制返回数量
    formatted_results = []
    for item in results[:num_results]:
        formatted_results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "content": item.get("content", ""),
            "engine": item.get("engine", ""),
            "score": item.get("score", 0),
            "category": item.get("category", ""),
            "publishedDate": item.get("publishedDate", ""),
        })

    return formatted_results


def search_news(query: str, num_results: int = 10) -> list[dict]:
    """搜索新闻"""
    return search(query, num_results=num_results, categories="news")


def search_images(query: str, num_results: int = 10) -> list[dict]:
    """搜索图片"""
    return search(query, num_results=num_results, categories="images")


if __name__ == "__main__":
    print("=== 测试通用搜索 ===")
    results = search("Python 编程", num_results=3)
    for i, r in enumerate(results, 1):
        print(f"\n[{i}] {r['title']}")
        print(f"    URL: {r['url']}")
        print(f"    摘要: {r['content'][:100]}..." if r['content'] else "    摘要: 无")
        print(f"    引擎: {r['engine']}")

    print("\n=== 测试新闻搜索 ===")
    news = search_news("人工智能", num_results=2)
    for i, r in enumerate(news, 1):
        print(f"\n[{i}] {r['title']}")
        print(f"    URL: {r['url']}")