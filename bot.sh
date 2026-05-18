#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/bot.pid"
LOG_FILE="$SCRIPT_DIR/data/bot.out"

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

cmd_start() {
  if is_running; then
    echo "Bot is already running (PID $(cat "$PID_FILE"))"
    exit 0
  fi

  mkdir -p "$SCRIPT_DIR/data"
  nohup node "$SCRIPT_DIR/src/index.js" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Bot started (PID $!)"
}

cmd_stop() {
  if ! is_running; then
    echo "Bot is not running"
    exit 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  kill "$pid"
  rm -f "$PID_FILE"
  echo "Bot stopped (PID $pid)"
}

cmd_status() {
  if is_running; then
    echo "Bot is running (PID $(cat "$PID_FILE"))"
  else
    echo "Bot is not running"
  fi
}

case "${1:-}" in
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
