# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run bot (node src/index.js)
npm run dev        # Auto-restart via nodemon (watches src/, ignores data/)
npm test           # Unit test — creates data/tracker.test.db, cleans up after
```

No lint, typecheck, or format commands exist.

To inspect the DB: `sqlite3 data/tracker.db "SELECT ..."`.

To reset session/logs (DB is safe): `rm -rf data/logs data/.wwebjs_auth`.

## Architecture

**Entry point:** `src/index.js` — initializes the WhatsApp client, SQLite DB, and processes all incoming messages via `message_create`.

**Message flow:**
1. `src/index.js` filters to group-only messages, checks whitelist, parses command prefix (`.`)
2. `src/commands/index.js` maps command name → `{ handler, requiresRegistration, isPublic, rateLimit }`
3. Public commands (`help`) are rate-limited without registration. All others require `.daftar` first.
4. Each handler receives `(msg, args, db, sender, groupId)` — `sender` is the DB user row, `groupId` is the integer PK from the `groups` table (not the WhatsApp group ID string).

**Balance model:** Payments are not linked to specific debt rows. Outstanding balance = `SUM(active debts) - SUM(all payments)` per `(group_id, debtor_id, creditor_id)` triple. See `getOutstandingBalance` in `src/utils/balance.js`.

**AI command:** Conditionally registered in `src/commands/index.js` only when `AI_ENABLED=true` and `AI_API_URL` is set. Uses an OpenAI-compatible API (`openai` npm package pointed at any compatible endpoint).

## Database Schema

Six tables in `data/tracker.db` (auto-created by `src/database.js`):

- `groups` — WhatsApp group identity (`wa_group_id` TEXT)
- `users` — registered users (`wa_user_id` TEXT, `display_name`)
- `debts` — debt records with `status IN ('active', 'cancelled')`; amounts are integers (Rupiah)
- `payments` — payment records (never cancelled; use `.batal` only on debts)
- `group_whitelist` — whitelisted group IDs (only relevant when `WHITELIST_ENABLED=true`)
- `command_log` — every command execution with status and error info

Timestamps are ISO 8601 with `+07:00` offset (Asia/Jakarta hardcoded).

## Key Utilities

- **`src/utils/parser.js`** — `parseCommand` extracts command+args from message body; `parseAmountString` handles Indonesian formats (dots, `k`/`rb`/`jt`/`m`, comma decimals, Hokkien slang like `goceng`/`ceban`)
- **`src/utils/balance.js`** — all DB read queries (balance calc, user/group upsert, whitelist check)
- **`src/utils/rate-limiter.js`** — in-memory only; resets on bot restart
- **`src/utils/logger.js`** — writes to both stdout and `data/logs/YYYY-MM-DD.log`

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `SUPER_ADMIN_USER_ID` | — | Integer `users.id`; enables auto-whitelist when superadmin sends in an unknown group |
| `WHITELIST_ENABLED` | `false` | Requires `SUPER_ADMIN_USER_ID` to be set |
| `AI_ENABLED` | `false` | Enables `.ai` command |
| `AI_PROVIDER` | `ollama` | `ollama`, `openai`, or any OpenAI-compatible |
| `AI_MODEL` | `llama3.2` | Model name passed to provider |
| `AI_API_URL` | `http://localhost:11434/v1` | Base URL for AI API |
| `AI_API_KEY` | — | Leave empty for Ollama |
| `AI_CONTEXT_MAX_ROWS` | — | Max DB rows sent to AI as context |

## Conventions & Gotchas

- **`package-lock.json` is gitignored** — do not commit it.
- **Bot only processes group messages** — DMs and its own outgoing messages are ignored.
- **`.daftar` is an upsert** — re-running it renames the user. `.rename` is a separate command for rename-only.
- **Unregistered users** get one rejection message per minute per group; subsequent attempts are silently dropped.
- **`msg.mentions`** auto-registers unregistered mentioned users using their WhatsApp pushname as the display name.
- **Every code change should check if README.md needs updating** — docs drift silently.
- **No pre-commit hooks, no CI** — verification is manual via `npm test`.
- First run prints a QR code to terminal; subsequent runs reuse the saved session in `data/.wwebjs_auth/`.
