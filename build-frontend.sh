#!/bin/bash
# 自动判断是否需要 --no-cache 构建前端

set -e

FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"
CACHE_FILE="$FRONTEND_DIR/.build-cache-hash"

calculate_hash() {
    # 计算 package.json 和 package-lock.json 的 hash
    md5 -q "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json" 2>/dev/null | md5 -q || \
    md5sum "$FRONTEND_DIR/package.json" "$FRONTEND_DIR/package-lock.json" 2>/dev/null | md5sum | cut -d' ' -f1
}

current_hash=$(calculate_hash)

# 检查是否有缓存文件
if [ -f "$CACHE_FILE" ]; then
    cached_hash=$(cat "$CACHE_FILE")
    if [ "$current_hash" != "$cached_hash" ]; then
        echo "📦 package.json 或 package-lock.json 有变化，使用 --no-cache 构建..."
        NO_CACHE="--no-cache"
    else
        echo "✅ 依赖未变化，使用缓存构建..."
        NO_CACHE=""
    fi
else
    echo "🆕 首次构建，创建缓存记录..."
    NO_CACHE=""
fi

# 执行构建
cd "$(dirname "$0")"
if [ -n "$NO_CACHE" ]; then
    docker compose build --no-cache frontend
else
    docker compose build frontend
fi

# 重启容器
echo "🚀 重启前端容器..."
docker compose up -d frontend

# 保存 hash
echo "$current_hash" > "$CACHE_FILE"

echo "✅ 构建完成！访问 http://localhost:3080"
