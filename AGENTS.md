# AGENTS.md

## Tech
- **Runtime:** Node.js v18+, no build step, no TypeScript, no linter/formatter
- **WhatsApp:** `whatsapp-web.js` + Puppeteer (auto-installs Chromium)
- **DB:** `better-sqlite3` (synchronous) creates `data/tracker.db` on first run with WAL mode
- **Timezone:** `Asia/Jakarta` hardcoded; all timestamps are ISO 8601 +07:00

## Commands
| command | description | leader |
|---|---|---|
| `npm start` | Run bot | `node src/index.js` |
| `npm run dev` | Auto-restart via nodemon (watches `src/`, ignores `data/`) | |
| `npm test` | Unit test (uses temp `data/tracker.test.db`, disposes after) | `node test-init.js` |
| `npm run clean` | No-op: just prints instructions to rm session/logs | |
| `rm -rf data/logs data/.wwebjs_auth` | Actual clean (DB is safe) | |

No lint, typecheck, or format commands exist.

## Architecture
- Entry: `src/index.js` → initializes client, SQLite, then listens via `message_create`
- Message router: `src/commands/index.js` maps command name → handler + metadata
- All commands require `.daftar` first except `.help` (public, rate-limited 1/min/user/group) and `.daftar` itself
- `.daftar` is an upsert (re-registration renames); `.rename` is a separate command
- **Undocumented command:** `.utangnya @user <amount>` — reverse of `.utang`, records the mentioned user as debtor to sender
- `.status` without mention shows all; with mention shows only that user's relationships
- Aggregate payment model: balance = `SUM(debts WHERE active) - SUM(payments)` per (debtor, creditor, group) pair — payments are *not* linked to specific debt rows
- `.batal` cancels a debt record (sets `status = cancelled`); cannot undo payments
- `.cancel` is not implemented (`.batal` only)

## DB
- Schema auto-created in `src/database.js` (4 tables: `groups`, `users`, `debts`, `payments`)
- Integers for currency amounts (Rupiah); `id-ID` locale for display
- `msg.mentions` auto-registers unregistered mentioned users with WhatsApp pushname as fallback

## Data directories (all gitignored, auto-created)
- `data/tracker.db` — SQLite production DB
- `data/logs/YYYY-MM-DD.log` — daily log files (logger writes to both file + stdout)
- `data/.wwebjs_auth/` — WhatsApp session (LocalAuth)
- `.wwebjs_cache/` — Puppeteer/Chromium cache

## Testing
- `npm test` runs `test-init.js`: creates a test DB, tests CRUD, balance calc, rate limiter, parser, then deletes the test DB
- No test framework (vanilla `node` script with assert-like throws)
- Test DB at `data/tracker.test.db` — cleaned up automatically
- `npm test` does NOT touch the production DB

## Gotchas
- `.gitignore` excludes `package-lock.json` — do not commit it
- No pre-commit hooks, no CI — all verification is manual via `npm test`
- Rate limiter is in-memory only (resets on restart)
- `npm run clean` is a no-op echo — actual cleanup requires `rm -rf data/logs data/.wwebjs_auth`
- On first run, QR code is printed to terminal; subsequent runs reuse saved session
- Bot only processes group messages (ignores DMs and its own messages)
- Unregistered users sending core commands get a rejection message (1/min silent ignore thereafter)
