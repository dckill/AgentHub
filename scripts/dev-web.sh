#!/usr/bin/env bash
# dev-web-restart.sh — 仅重启前端 Web 服务（不动 daemon）
# 用法: ./scripts/dev-web-restart.sh [端口号]
# 默认端口: 13003

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PORT="${1:-13003}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── 停止前端 ───────────────────────────────────────────────────

stop_web() {
    info "停止前端进程..."

    # 杀掉占用端口的进程
    PID_ON_PORT=$(lsof -ti :"$WEB_PORT" 2>/dev/null || true)
    if [ -n "$PID_ON_PORT" ]; then
        kill $PID_ON_PORT 2>/dev/null || true
        sleep 1
        if lsof -ti :"$WEB_PORT" &>/dev/null 2>&1; then
            warn "进程未响应 SIGTERM，发送 SIGKILL..."
            kill -9 $(lsof -ti :"$WEB_PORT") 2>/dev/null || true
            sleep 1
        fi
        ok "端口 $WEB_PORT 已释放"
    fi

    # 杀掉残留 expo 进程
    EXPO_PIDS=$(pgrep -f "expo.*start.*--web" 2>/dev/null || true)
    if [ -n "$EXPO_PIDS" ]; then
        echo "$EXPO_PIDS" | xargs kill 2>/dev/null || true
        sleep 1
        ok "Expo 进程已终止"
    fi
}

# ── 启动前端 ───────────────────────────────────────────────────

start_web() {
    info "启动 Web 应用 (端口: $WEB_PORT)..."

    cd "$ROOT_DIR/packages/agenthub-app"

    CI=1 npx expo start --web --port "$WEB_PORT" &
    EXPO_PID=$!

    # 等待就绪
    info "等待 Web 服务就绪..."
    MAX_WAIT=30
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -s "http://localhost:$WEB_PORT" >/dev/null 2>&1; then
            break
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done

    if [ $WAITED -lt $MAX_WAIT ]; then
        ok "Web 服务已就绪"
    else
        warn "等待超时 (${MAX_WAIT}s)，服务可能仍在启动"
    fi

    echo ""
    echo -e "${GREEN}────────────────────────────────────────${NC}"
    echo -e "  Web:  ${CYAN}http://localhost:$WEB_PORT${NC}"
    echo -e "  PID:  $EXPO_PID"
    echo -e "  停止: ${YELLOW}kill $EXPO_PID${NC}"
    echo -e "${GREEN}────────────────────────────────────────${NC}"

    cleanup() {
        echo ""
        info "正在清理..."
        kill $EXPO_PID 2>/dev/null || true
        ok "前端已停止，daemon 不受影响"
        exit 0
    }
    trap cleanup SIGINT SIGTERM

    wait $EXPO_PID
}

# ── 主逻辑 ─────────────────────────────────────────────────────

ACTION="${2:-}"

case "$ACTION" in
    stop)
        stop_web
        ok "前端已停止"
        ;;
    start)
        start_web
        ;;
    *)
        # 默认: 重启
        stop_web
        echo ""
        start_web
        ;;
esac
