# AGENTS.md

## Tech
- **Runtime:** Node.js v18+, no build step, no TypeScript, no linter/formatter
- **WhatsApp:** `whatsapp-web.js` + Puppeteer (auto-installs Chromium)
- **DB:** `better-sqlite3` (synchronous) creates `data/tracker.db` on first run with WAL mode
- **Scheduler:** `croner` (timezone-aware cron, Asia/Jakarta)
- **Timezone:** `Asia/Jakarta` hardcoded; all timestamps are ISO 8601 +07:00

## Commands
| command | description | leader |
|---|---|---|
| `npm start` | Run bot | `node src/index.js` |
| `./bot.sh foreground` | Run bot attached for QR scan | `node src/index.js` |
| `./bot.sh start` | Run bot detached with console log + `systemd-inhibit` when available | |
| `./bot.sh stop` | Stop managed/orphan bot process | |
| `./bot.sh restart` | Stop then start detached managed bot | |
| `./bot.sh status` | Check PID, node process, inhibitor, latest app log | |
| `./bot.sh logs` / `./bot.sh tail` | Inspect/follow app + console logs, including QR output | |
| `npm run dev` | Auto-restart via nodemon (watches `src/`, ignores `data/`) | |
| `npm test` | Unit test (uses temp `data/tracker.test.db`, disposes after) | `node test-init.js` |
| `npm run clean` | No-op: just prints instructions to rm session/logs | |
| `rm -rf data/logs data/.wwebjs_auth` | Actual clean (DB is safe) | |

No lint, typecheck, or format commands exist.

## Architecture
- Entry: `src/index.js` → initializes core (db, features, router, scheduler), then listens via `message_create`
- **Feature-based:** each feature lives in `src/features/<name>/` with its own manifest, schema, commands
- **1 grup = 1 fitur:** `group_features` table binds a WA group to exactly one feature
- **Feature gate:** router checks `group_features` before dispatching any command (except `.assist`)
- **Global command:** only `.assist` (super admin) — manages feature assignment per group
- Message router: `src/core/router.js` — parse → .assist? → feature gate → dispatch
- Feature loader: `src/core/feature-loader.js` — auto-discovers `src/features/*/index.js`
- Scheduler: `src/core/scheduler.js` — runs cron jobs defined in feature manifests

## Feature Manifest Contract
Each feature's `index.js` must export:
```js
module.exports = {
  name: 'feature-name',
  description: 'Human-readable description',
  initSchema(db) { /* CREATE TABLE IF NOT EXISTS ... */ },
  commands: { /* command_name: { handler, requiresRegistration, rateLimit, help } */ },
  schedules: [ /* { name, cron, tz, run } */ ],
};
```

## DB
- Shared schema in `src/core/db.js`: `groups`, `users`, `group_features`, `scheduled_runs`, `command_log`
- Feature-specific schema in `src/features/<name>/schema.js` (called by feature-loader)
- `group_features` table: `wa_group_id TEXT PK, feature_name TEXT, assigned_at TEXT`
- Migration on startup: existing groups with debts auto-assigned to `debt-tracker`
- Integers for currency amounts (Rupiah); `id-ID` locale for display
- `yt_members` table: `id, display_name, wa_user_id (nullable), balance, active, created_at`
- `yt_transactions` table: `id, member_id, type (topup/deduction/adjustment), amount, balance_after, description, created_at`

## Data directories (all gitignored, auto-created)
- `data/tracker.db` — SQLite production DB
- `data/logs/YYYY-MM-DD.log` — daily log files (logger writes to both file + stdout)
- `data/logs/bot-console.log` — detached stdout/stderr from `bot.sh`, including QR output
- `data/bot.pid` — managed wrapper PID from `bot.sh`
- `data/.wwebjs_auth/` — WhatsApp session (LocalAuth)
- `.wwebjs_cache/` — Puppeteer/Chromium cache

## Testing
- `npm test` runs `test-init.js`: creates a test DB, tests CRUD, balance calc, rate limiter, parser, then deletes the test DB
- No test framework (vanilla `node` script with assert-like throws)
- Test DB at `data/tracker.test.db` — cleaned up automatically
- `npm test` does NOT touch the production DB

## Conventions
- **Every change must check if README needs updating** — docs drift silently otherwise
- Amount parser (`parseAmountString` in `src/shared/parser.js`) supports: Indonesian thousands dots, suffix multipliers, decimal comma, and Hokkien slang

## Gotchas
- `.gitignore` excludes `package-lock.json` — do not commit it
- No pre-commit hooks, no CI — all verification is manual via `npm test`
- Rate limiter is in-memory only (resets on restart)
- `npm run clean` is a no-op echo — actual cleanup requires `rm -rf data/logs data/.wwebjs_auth`
- QR code is printed to stdout; use `./bot.sh foreground` for manual scan or `./bot.sh tail` for detached console output
- Bot only processes group messages (ignores DMs and its own messages)
- Unregistered users sending commands that require registration get a rejection message (1/min, then silent)
- `group_whitelist` table still exists in DB but is no longer used (replaced by `group_features`)
