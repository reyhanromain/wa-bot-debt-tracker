#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/bot.pid"
LOG_DIR="$SCRIPT_DIR/data/logs"
CONSOLE_LOG="$LOG_DIR/bot-console.log"
APP_LOG="$LOG_DIR/$(date +%F).log"

ensure_dirs() {
  mkdir -p "$LOG_DIR"
}

pid_from_file() {
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE"
  fi
}

is_running() {
  local pid
  pid="$(pid_from_file || true)"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

cleanup_stale_pid() {
  if [ -f "$PID_FILE" ] && ! is_running; then
    rm -f "$PID_FILE"
  fi
}

node_pids() {
  pgrep -f "node .*src/index.js|node $SCRIPT_DIR/src/index.js" 2>/dev/null || true
}

stop_node_pids() {
  local pids
  pids="$(node_pids)"
  if [ -z "$pids" ]; then
    return 0
  fi

  for pid in $pids; do
    kill "$pid" 2>/dev/null || true
  done
}

cmd_start() {
  ensure_dirs
  cleanup_stale_pid

  if is_running; then
    echo "Bot is already running (PID $(pid_from_file))"
    exit 0
  fi

  local existing_nodes
  existing_nodes="$(node_pids)"
  if [ -n "$existing_nodes" ]; then
    echo "Bot node process already exists without managed wrapper: $existing_nodes"
    echo "Run './bot.sh restart' to stop it and start managed mode."
    exit 1
  fi

  local runner=(node "$SCRIPT_DIR/src/index.js")
  if command -v systemd-inhibit >/dev/null 2>&1; then
    runner=(systemd-inhibit --what=handle-lid-switch:sleep:idle --why="WA Debt Tracker" "${runner[@]}")
  fi

  nohup setsid "${runner[@]}" >> "$CONSOLE_LOG" 2>&1 < /dev/null &
  echo $! > "$PID_FILE"

  echo "Bot started (wrapper PID $(cat "$PID_FILE"))"
  echo "Console log: $CONSOLE_LOG"
}

cmd_stop() {
  cleanup_stale_pid
  if ! is_running; then
    if [ -n "$(node_pids)" ]; then
      stop_node_pids
      rm -f "$PID_FILE"
      echo "Bot node process stopped"
      exit 0
    fi
    echo "Bot is not running"
    exit 0
  fi

  local pid
  pid="$(pid_from_file)"
  kill "$pid" 2>/dev/null || true

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  if kill -0 "$pid" 2>/dev/null; then
    stop_node_pids
    echo "Bot did not stop after SIGTERM (PID $pid)"
    exit 1
  fi

  stop_node_pids

  rm -f "$PID_FILE"
  echo "Bot stopped (PID $pid)"
}

cmd_restart() {
  cmd_stop || true
  stop_node_pids
  cmd_start
}

cmd_status() {
  cleanup_stale_pid

  if is_running; then
    echo "Bot managed PID is running (PID $(pid_from_file))"
  else
    echo "Bot managed PID is not running"
  fi

  local pids
  pids="$(node_pids)"
  if [ -n "$pids" ]; then
    echo "Node process(es): $pids"
  else
    echo "Node process(es): none"
  fi

  if command -v systemd-inhibit >/dev/null 2>&1; then
    if systemd-inhibit --list 2>/dev/null | grep -q "WA Debt Tracker"; then
      echo "Inhibitor: active"
    else
      echo "Inhibitor: not active"
    fi
  else
    echo "Inhibitor: unavailable (systemd-inhibit not found)"
  fi

  if [ -f "$APP_LOG" ]; then
    echo "Latest app log:"
    tail -5 "$APP_LOG"
  else
    echo "Latest app log: not found ($APP_LOG)"
  fi
}

cmd_logs() {
  ensure_dirs
  echo "== App log: $APP_LOG =="
  if [ -f "$APP_LOG" ]; then
    tail -40 "$APP_LOG"
  else
    echo "Not found"
  fi

  echo
  echo "== Console log: $CONSOLE_LOG =="
  if [ -f "$CONSOLE_LOG" ]; then
    tail -80 "$CONSOLE_LOG"
  else
    echo "Not found"
  fi
}

cmd_tail() {
  ensure_dirs
  touch "$CONSOLE_LOG"
  tail -f "$CONSOLE_LOG"
}

cmd_foreground() {
  ensure_dirs
  echo "Running in foreground. Scan QR here if shown. Press Ctrl+C to stop."
  exec node "$SCRIPT_DIR/src/index.js"
}

case "${1:-}" in
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  restart)    cmd_restart ;;
  status)     cmd_status ;;
  logs)       cmd_logs ;;
  tail)       cmd_tail ;;
  foreground) cmd_foreground ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|tail|foreground}"
    exit 1
    ;;
esac
