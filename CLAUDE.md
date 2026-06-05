# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run bot (node src/index.js)
npm run dev        # Auto-restart via nodemon (watches src/, ignores data/)
npm test           # Unit test — creates data/tracker.test.db, cleans up after

./bot.sh foreground   # Run attached (needed for first-run QR scan)
./bot.sh start|stop|restart|status|logs|tail|journal   # systemd --user wrapper
./bot.sh enable|disable|uninstall   # Auto-start at boot (calls sudo loginctl enable-linger)
```

No lint, typecheck, or format commands exist.

To inspect the DB: `sqlite3 data/tracker.db "SELECT ..."`.

To reset session/logs (DB is safe): `rm -rf data/logs data/.wwebjs_auth`.

## Architecture

**Entry point:** `src/index.js` boots core modules (`db`, `feature-loader`, `router`, `scheduler`) then listens on `message_create`.

**Feature-based:** each feature lives in `src/features/<name>/` with its own manifest (`index.js`), schema (`schema.js`), and `commands/`. `src/core/feature-loader.js` auto-discovers them. Current features: `debt-tracker`, `yt-subs-reminder`.

**1 group = 1 feature:** the `group_features` table binds a WA group to exactly one feature. `src/core/router.js` dispatches: parse command → if `.assist` (super-admin global) handle directly → look up `group_features` (gate) → call the feature's handler. Groups without an assigned feature silently ignore all commands.

**Handler signature:** `(msg, args, db, sender, groupId)` — `sender` is the DB user row, `groupId` is the integer PK from `groups` (not the WA group ID string). Public commands (`help`) are rate-limited without registration; the rest require `.daftar` first.

**Balance model (debt-tracker):** Payments are not linked to specific debt rows. Outstanding balance = `SUM(active debts) - SUM(all payments)` per `(group_id, debtor_id, creditor_id)` triple. See `getOutstandingBalance` in `src/features/debt-tracker/utils.js`.

**AI command:** registered inside the `debt-tracker` feature only when `AI_ENABLED=true` and `AI_API_URL` is set. Uses the `openai` npm package against any OpenAI-compatible endpoint. The AI calls feature-defined tools (in `src/features/debt-tracker/ai-tools.js`) via OpenAI function calling and `src/utils/ai.js` runs the tool-call loop (max 5 iterations, then forced final answer without tools). No DB data is pre-loaded into the context — the model fetches what it needs on demand. Model must support tool use (e.g. `deepseek-chat`, `llama3.1`, `qwen2.5`).

**Scheduler:** `src/core/scheduler.js` runs `schedules` declared in feature manifests via `croner` (Asia/Jakarta). Last-run tracked in `scheduled_runs`.

**Resilience:** `src/index.js` listens on `disconnected`/`auth_failure`/`uncaughtException`/`unhandledRejection` and exits non-zero so systemd respawns. A heartbeat (`client.getState()` every 120s, 3 consecutive non-`CONNECTED` results = exit) catches silent hangs. `bot.sh` installs `~/.config/systemd/user/wa-bot.service` on first `start` and is the canonical process manager. `src/utils/notifier.js` sends Telegram alerts + the QR PNG when re-scan is needed (no-op if `NOTIFY_TELEGRAM_TOKEN`/`CHAT_ID` env vars aren't set).

## Database Schema

`data/tracker.db` is auto-created on first run by `src/core/db.js` (WAL mode). Shared tables:

- `groups` — WhatsApp group identity (`wa_group_id` TEXT)
- `users` — registered users (`wa_user_id`, `display_name`)
- `group_features` — `(wa_group_id PK, feature_name, assigned_at)`; binds a group to one feature
- `scheduled_runs` — `(job_name PK, last_run_at)`; scheduler bookkeeping
- `command_log` — every command execution with status and error info

Feature-owned tables (created by each feature's `schema.js`):

- `debt-tracker`: `debts` (status `active`/`cancelled`, integer Rupiah), `payments` (never cancelled — use `.batal` on the debt)
- `yt-subs-reminder`: `yt_members`, `yt_transactions`

Migration on startup: groups that already have debts are auto-assigned to `debt-tracker`. A legacy `group_whitelist` table may still exist in older DBs but is no longer read.

Timestamps are ISO 8601 with `+07:00` offset (Asia/Jakarta hardcoded).

## Key Utilities

- **`src/shared/parser.js`** — `parseCommand` extracts command+args; `parseAmountString` handles Indonesian formats (dots, `k`/`rb`/`jt`/`m`, comma decimals, Hokkien slang like `goceng`/`ceban`); also `extractAmount`, `getMentionedId`, `nowWIB`, `formatAmount`, `isGroupMessage`
- **`src/features/debt-tracker/utils.js`** — debt-tracker DB helpers: `ensureGroup`, `ensureUser`, `getUser`, `getOutstandingBalance`, `getAllOutstandingBalances`
- **`src/core/rate-limiter.js`** — in-memory only; resets on bot restart
- **`src/core/logger.js`** — writes to both stdout and `data/logs/YYYY-MM-DD.log`

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `SUPER_ADMIN_USER_ID` | — | Integer `users.id`; required to run the `.assist` global command for managing per-group feature assignment |
| `AI_ENABLED` | `false` | Enables `.ai` command |
| `AI_PROVIDER` | `ollama` | `ollama`, `openai`, or any OpenAI-compatible |
| `AI_MODEL` | `llama3.2` | Model name passed to provider |
| `AI_API_URL` | `http://localhost:11434/v1` | Base URL for AI API |
| `AI_API_KEY` | — | Leave empty for Ollama |
| `NOTIFY_TELEGRAM_TOKEN` | — | Telegram bot token; required for remote QR delivery + alerts. Leave empty to disable notifier. |
| `NOTIFY_TELEGRAM_CHAT_ID` | — | Chat ID to receive alerts (your DM with the bot) |

## Conventions & Gotchas

- **`package-lock.json` is gitignored** — do not commit it.
- **Bot only processes group messages** — DMs and its own outgoing messages are ignored.
- **`.daftar` is an upsert** — re-running it renames the user. `.rename` is a separate command for rename-only.
- **Unregistered users** get one rejection message per minute per group; subsequent attempts are silently dropped.
- **`msg.mentions`** auto-registers unregistered mentioned users using their WhatsApp pushname as the display name.
- **Every code change should check if README.md needs updating** — docs drift silently.
- **No pre-commit hooks, no CI** — verification is manual via `npm test`.
- First run prints a QR code to terminal; subsequent runs reuse the saved session in `data/.wwebjs_auth/`.
- **`AGENTS.md` mirrors much of this file** with deeper detail on the feature manifest contract and `bot.sh` — when changing architecture, update both.
