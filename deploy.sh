#!/bin/bash
# 部署脚本 - 自动判断前端是否需要重建

set -e

cd "$(dirname "$0")"

echo "=== 🔍 检查服务状态 ==="
docker compose ps

echo ""
echo "=== 🏗️  构建前端 ==="
./build-frontend.sh

echo ""
echo "=== 🚀 启动所有服务 ==="
docker compose up -d

echo ""
echo "=== ✅ 部署完成 ==="
docker compose ps

# 显示访问地址
echo ""
echo "访问地址："
echo "  前端: http://localhost:3080"
echo "  网关: http://localhost:8080"
