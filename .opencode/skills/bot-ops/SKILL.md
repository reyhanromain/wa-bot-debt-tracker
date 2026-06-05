---
name: bot-ops
description: Use when operating this WhatsApp bot locally: check status, inspect logs, restart for QR scan, restart detached with systemd-inhibit, or diagnose why the bot is not responding.
---

# WhatsApp Bot Operations

Use this skill for operational tasks in this repository, especially when the user asks whether the bot is running, why WhatsApp messages are not answered, where logs are, how to scan QR, or how to keep the bot alive while the screen locks/sleeps.

## Safety Rules

- Do not delete `data/tracker.db`, `data/.wwebjs_auth`, or `.wwebjs_cache` unless the user explicitly asks for a reset.
- Do not run `npm run clean` or `rm -rf data/.wwebjs_auth` as a troubleshooting shortcut.
- Prefer `./bot.sh` for lifecycle operations instead of raw `node src/index.js` or ad-hoc `nohup` commands.
- It is safe to run status/log/test commands without asking.
- Ask before stopping/restarting the bot if the user did not request an action that clearly requires it.
- If QR scan is needed, the manual step is always the user scanning from WhatsApp mobile. The assistant can expose the QR log, but cannot scan it.

## Main Commands

Run from the repository root:

```bash
./bot.sh status
./bot.sh start
./bot.sh stop
./bot.sh restart
./bot.sh logs
./bot.sh tail
./bot.sh foreground
```

Semantics:

- `status`: show PID, process state, latest app log state, and whether an inhibitor lock is active.
- `start`: start detached in the background, capture terminal output to `data/logs/bot-console.log`, and use `systemd-inhibit` when available.
- `stop`: gracefully stop the PID recorded in `data/bot.pid`; remove stale PID files.
- `restart`: stop then start detached.
- `logs`: print latest app log tail and console log tail.
- `tail`: follow `data/logs/bot-console.log`; this is where QR output appears when detached.
- `foreground`: run `node src/index.js` directly in the current terminal for QR scanning. This intentionally does not detach.

## Diagnosis Flow

1. Run `./bot.sh status`.
2. If it says the bot is not running, run `./bot.sh start`.
3. If it is running but not responding, run `./bot.sh logs`.
4. If logs repeatedly say `QR code displayed — waiting for scan`, the bot is alive but not authenticated.
5. For QR scan, stop detached mode and run foreground:

```bash
./bot.sh stop
./bot.sh foreground
```

After the user scans QR and the terminal shows `Authentication successful` and `Bot ready`, they can press `Ctrl+C`, then restart detached:

```bash
./bot.sh start
```

## Log Locations

- Daily app log: `data/logs/YYYY-MM-DD.log`
- Detached stdout/stderr including QR: `data/logs/bot-console.log`
- PID file: `data/bot.pid`

Important: the QR code is printed to stdout, not to the daily app logger. In detached mode, inspect `data/logs/bot-console.log`.

## Verification After Changes

When changing bot operations code or docs:

```bash
bash -n bot.sh
npm test
git status --short
```

Do not commit unless the user explicitly asks.
