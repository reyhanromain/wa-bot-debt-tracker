#!/usr/bin/env bash
# WA Debt Tracker bot wrapper.
# Manages the bot as a systemd --user service so it auto-restarts on crash
# and survives reboots once enabled. Falls back to direct `node` for the
# `foreground` subcommand (used for the first-time QR scan).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/data/logs"
CONSOLE_LOG="$LOG_DIR/bot-console.log"
APP_LOG="$LOG_DIR/$(date +%F).log"

UNIT_NAME="wa-bot.service"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_FILE="$UNIT_DIR/$UNIT_NAME"

if [ -n "${NODE_BIN:-}" ]; then
  NODE_BIN="$NODE_BIN"
elif [ -x /usr/bin/node ]; then
  NODE_BIN="/usr/bin/node"
else
  NODE_BIN="$(command -v node || echo /usr/bin/node)"
fi

ensure_dirs() {
  mkdir -p "$LOG_DIR" "$UNIT_DIR"
}

unit_content() {
  cat <<EOF
[Unit]
Description=WhatsApp Debt Tracker Bot
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
WorkingDirectory=$SCRIPT_DIR
ExecStart=$NODE_BIN $SCRIPT_DIR/src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$CONSOLE_LOG
StandardError=append:$CONSOLE_LOG

[Install]
WantedBy=default.target
EOF
}

install_unit_if_needed() {
  ensure_dirs
  local desired
  desired="$(unit_content)"
  if [ -f "$UNIT_FILE" ] && [ "$(cat "$UNIT_FILE")" = "$desired" ]; then
    return 0
  fi
  echo "$desired" > "$UNIT_FILE"
  systemctl --user daemon-reload
  echo "Installed/updated systemd unit at $UNIT_FILE"
}

systemd_state() {
  systemctl --user is-active "$UNIT_NAME" 2>/dev/null || echo "inactive"
}

direct_node_pids() {
  # PIDs matching our entry point, EXCLUDING ones managed by the systemd unit.
  local all pid result=""
  all="$(pgrep -f "node $SCRIPT_DIR/src/index.js" 2>/dev/null || true)"
  for pid in $all; do
    if [ -r "/proc/$pid/cgroup" ] && grep -q "$UNIT_NAME" "/proc/$pid/cgroup" 2>/dev/null; then
      continue
    fi
    result="$result $pid"
  done
  echo "$result" | xargs
}

warn_if_direct_running() {
  local pids
  pids="$(direct_node_pids)"
  if [ -n "$pids" ]; then
    echo "⚠️  A non-managed node process is running: $pids"
    echo "    (probably leftover from './bot.sh foreground'). Kill it first or it will conflict."
  fi
}

cmd_start() {
  install_unit_if_needed
  warn_if_direct_running
  systemctl --user start "$UNIT_NAME"
  sleep 1
  cmd_status
}

cmd_stop() {
  if [ ! -f "$UNIT_FILE" ]; then
    echo "Unit not installed yet (run './bot.sh start' first)."
    # Best-effort: kill any stray direct node process
    local pids
    pids="$(direct_node_pids)"
    if [ -n "$pids" ]; then
      echo "Killing direct node process(es): $pids"
      kill $pids 2>/dev/null || true
    fi
    exit 0
  fi
  systemctl --user stop "$UNIT_NAME" || true
  echo "Bot stopped."
}

cmd_restart() {
  install_unit_if_needed
  warn_if_direct_running
  systemctl --user restart "$UNIT_NAME"
  sleep 1
  cmd_status
}

cmd_status() {
  if [ -f "$UNIT_FILE" ]; then
    local state
    state="$(systemd_state)"
    echo "Systemd state: $state"
    systemctl --user status "$UNIT_NAME" --no-pager --lines=5 || true
  else
    echo "Unit not installed yet. Run './bot.sh start' to install + start, or './bot.sh foreground' for first-time QR scan."
  fi

  local linger
  if loginctl show-user "$USER" 2>/dev/null | grep -q "Linger=yes"; then
    linger="enabled"
  else
    linger="disabled (bot will stop when you log out; run './bot.sh enable' to fix)"
  fi
  echo "Linger: $linger"

  local pids
  pids="$(direct_node_pids)"
  if [ -n "$pids" ]; then
    echo "Direct node PIDs (foreground/leftover): $pids"
  fi

  if [ -f "$APP_LOG" ]; then
    echo ""
    echo "Latest app log:"
    tail -5 "$APP_LOG"
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

cmd_journal() {
  journalctl --user -u "$UNIT_NAME" -n 100 --no-pager
}

cmd_foreground() {
  ensure_dirs
  if [ "$(systemd_state)" = "active" ]; then
    echo "Managed service is running. Run './bot.sh stop' first to free the WA session."
    exit 1
  fi
  warn_if_direct_running
  echo "Running in foreground. Scan QR here if shown. Press Ctrl+C to stop."
  exec "$NODE_BIN" "$SCRIPT_DIR/src/index.js"
}

cmd_enable() {
  install_unit_if_needed
  systemctl --user enable "$UNIT_NAME"
  if ! loginctl show-user "$USER" 2>/dev/null | grep -q "Linger=yes"; then
    echo "Enabling linger so the bot keeps running after you log out."
    echo "This needs sudo:"
    sudo loginctl enable-linger "$USER"
  fi
  echo "Bot will auto-start at boot."
}

cmd_disable() {
  if [ -f "$UNIT_FILE" ]; then
    systemctl --user disable "$UNIT_NAME" || true
  fi
  echo "Auto-start at boot disabled."
  echo "(Linger left as-is; run 'sudo loginctl disable-linger $USER' if you want to revert that too.)"
}

cmd_uninstall() {
  cmd_stop || true
  if [ -f "$UNIT_FILE" ]; then
    rm -f "$UNIT_FILE"
    systemctl --user daemon-reload
    echo "Removed unit file $UNIT_FILE"
  else
    echo "Unit file not present."
  fi
}

usage() {
  cat <<EOF
Usage: $0 <command>

Managed (systemd --user):
  start         Install unit if needed + start the bot
  stop          Stop the bot
  restart       Restart the bot
  status        Show systemd state, linger status, latest app log
  enable        Enable auto-start at boot (+ enable linger via sudo)
  disable       Disable auto-start at boot
  uninstall     Stop bot + remove systemd unit file

Logs:
  logs          Tail recent lines from data/logs/{today,console}
  tail          Follow data/logs/bot-console.log live
  journal       Show last 100 lines from systemd journal for this unit

Standalone:
  foreground    Run node directly (no systemd) — use for first-time QR scan

Files:
  Unit:    $UNIT_FILE
  Console: $CONSOLE_LOG
EOF
}

case "${1:-}" in
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  restart)    cmd_restart ;;
  status)     cmd_status ;;
  logs)       cmd_logs ;;
  tail)       cmd_tail ;;
  journal)    cmd_journal ;;
  foreground) cmd_foreground ;;
  enable)     cmd_enable ;;
  disable)    cmd_disable ;;
  uninstall)  cmd_uninstall ;;
  -h|--help|help|"") usage ;;
  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
