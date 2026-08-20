#!/bin/bash
# ============================================================
#  BeadPixel 启动脚本 (Linux / macOS)
#  用法:
#    ./start.sh         生产模式 (npm start)
#    ./start.sh dev     开发模式 (npm run dev, 热重载)
# ============================================================
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[BeadPixel] 未检测到 node_modules，正在安装依赖..."
  npm install
fi

if [ "$1" = "dev" ]; then
  echo "[BeadPixel] 以开发模式启动 (http://localhost:3000)..."
  npm run dev
else
  echo "[BeadPixel] 以生产模式启动 (http://localhost:3000)..."
  npm start
fi
