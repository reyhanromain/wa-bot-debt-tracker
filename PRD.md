# PRD — WhatsApp Debt Tracker Bot

> **Document Status:** Final  
> **Last Updated:** 10 May 2026  
> **Author:** AI Assistant

---

## 1. Executive Summary

A WhatsApp group bot for tracking debts between group members. Built with `whatsapp-web.js` and SQLite. Users can register with a display name, then record debts, make payments, and view debt status. Public commands (like `.help`) are available to everyone with rate limiting, while core commands require registration.

---

## 2. Technology Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js (v18+) |
| WhatsApp API | [whatsapp-web.js](https://wwebjs.dev) (unofficial) |
| Browser Automation | Puppeteer (via whatsapp-web.js) |
| Database | SQLite via `better-sqlite3` |
| QR Code Display | `qrcode-terminal` |
| Timezone | Asia/Jakarta (WIB) |
| Active Session Storage | `./data/.wwebjs_auth/` |
| Database Storage | `./data/tracker.db` |

---

## 3. Database Schema (English)

### 3.1. `groups`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| wa_group_id | TEXT | UNIQUE, NOT NULL | WhatsApp group ID (e.g. `62812-xxx@g.us`) |
| name | TEXT | | Cached group name |
| created_at | TEXT | NOT NULL | ISO 8601 with WIB offset |

### 3.2. `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| wa_user_id | TEXT | UNIQUE, NOT NULL | WhatsApp user ID (e.g. `62812xxx@c.us`) |
| display_name | TEXT | NOT NULL | Custom name set via `.daftar` / `.rename` |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

### 3.3. `debts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| group_id | INTEGER | FK → groups.id, NOT NULL | Group scope isolation |
| debtor_id | INTEGER | FK → users.id, NOT NULL | Person who owes money |
| creditor_id | INTEGER | FK → users.id, NOT NULL | Person who is owed money |
| amount | INTEGER | NOT NULL, CHECK (> 0) | Amount in Rupiah (integer) |
| description | TEXT | | Optional description (e.g. "donat") |
| status | TEXT | NOT NULL, DEFAULT 'active' | `active` or `cancelled` |
| created_at | TEXT | NOT NULL | |
| updated_at | TEXT | NOT NULL | |

### 3.4. `payments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| group_id | INTEGER | FK → groups.id, NOT NULL | Group scope isolation |
| payer_id | INTEGER | FK → users.id, NOT NULL | Person who paid |
| receiver_id | INTEGER | FK → users.id, NOT NULL | Person who received payment |
| amount | INTEGER | NOT NULL, CHECK (> 0) | Amount paid in Rupiah |
| description | TEXT | | Optional description |
| created_at | TEXT | NOT NULL | |

### 3.5. Key Design Decisions

- **Aggregate payment model:** `.bayar` and `.lunas` do not target a specific debt record. The outstanding balance is computed as `SUM(debts.amount WHERE status=active) - SUM(payments.amount)` for each (debtor, creditor, group) pair.
- **Per-group isolation:** All tables reference `groups.id`, ensuring debts from different WhatsApp groups never mix.
- **Integer amounts:** All monetary values stored as integers (Rupiah) to avoid floating-point precision issues.
- **Timestamp format:** ISO 8601 strings with +07:00 offset (WIB).

---

## 4. Command Specification

### 4.1. Command Categories

| Category | Description | Requires `.daftar`? | Rate Limited? |
|----------|-------------|---------------------|---------------|
| **Public** | Accessible to everyone (including unregistered users) | ❌ No | ✅ Yes |
| **Core** | Main bot functionality | ✅ Yes | ❌ No |

### 4.2. Registration Requirement

- **`.daftar`** is mandatory before using any **Core** command.
- When an unregistered user sends a Core command, the bot replies **once per minute** with:
  `"❌ Silakan daftar dulu dengan .daftar <nama>"`
- Subsequent command attempts within the same minute are **silently ignored**.

### 4.3. Rate Limiting Rules

| Skenario | Rate Limit | Perintah ke-1 | Perintah ke-2+ (dalam 1 menit) |
|----------|-----------|--------------|-------------------------------|
| Belum daftar + `.help` | ✅ 1x / menit | Tampilkan help | **Silent** (abaikan) |
| Belum daftar + Core command | ✅ 1x / menit | Tolak: "daftar dulu" | **Silent** (abaikan) |
| Sudah daftar + command existing | ❌ Tidak | Diproses normal | Diproses normal |
| Future public commands | ✅ 2x / menit / user | Diproses normal | Ke-3+ **Silent** |

- "Silent" = bot tidak mengirim pesan apa pun.
- Rate limit **per user per group per command**.
- Rate limit bersifat **in-memory** (hilang saat bot restart).

### 4.4. `.daftar <name>`

- **Category:** Core (but usable without prior registration as entry point)
- **Purpose:** Register the user with a display name for the bot's reports.
- **Behavior (Upsert):**
  - If `wa_user_id` does not exist in `users` → INSERT a new row.
  - If `wa_user_id` already exists → UPDATE `display_name`.
- **Reply:** `"✅ Berhasil mendaftar dengan nama <name>"`

### 4.5. `.rename <name>`

- **Category:** Core
- **Purpose:** Change the user's display name.
- **Behavior:** UPDATE `display_name` WHERE `wa_user_id = sender`.
- **Reply:** `"✅ Nama berhasil diubah menjadi <name>"`

### 4.6. `.utang @<mention> <amount> [description]`

- **Category:** Core
- **Purpose:** Record a new debt from the sender to the mentioned user.
- **Validation:**
  - `amount` must be a positive integer.
  - `@mention` is required (exactly one user, not self).
- **Behavior:** INSERT into `debts` with `status = 'active'`.
- **Reply:** `"✅ Berhasil mencatat utang Rp<amount> ke @user | <description>"`

### 4.7. `.bayar @<mention> <amount> [description]`

- **Category:** Core
- **Purpose:** Make a payment toward the total outstanding debt to the mentioned user.
- **Validation:**
  - `amount` must be a positive integer.
  - `amount` must not exceed the current outstanding balance.
- **Behavior:** INSERT into `payments`.
- **Reply:** `"✅ Berhasil membayar utang Rp<amount> ke @user | <description>"`

### 4.8. `.lunas @<mention>`

- **Category:** Core
- **Purpose:** Pay off all outstanding debt to the mentioned user.
- **Behavior:**
  - Calculate remaining = SUM(debts active) - SUM(payments) for (sender, @mention, group).
  - If remaining ≤ 0 → reply `"✅ Tidak ada utang tersisa ke @user"`.
  - Otherwise → INSERT into `payments` with amount = remaining, description = "semua utang lunas".
- **Reply:** `"✅ Berhasil melunasi semua utang Rp<remaining> ke @user"`

### 4.9. `.status [@<mention>]`

- **Category:** Core
- **Purpose:** View debt status report.
- **With mention (Opsi C):** Show up to **3 latest transactions** involving the mentioned user (debts + payments combined, newest first). Also show outstanding balances per relationship (both as debtor and as creditor).
- **Without mention:** Show all users involved in the current group with their outstanding balances and 3 latest transactions.
- **Display per relationship:**
  - `@debtor → @creditor`
  - Outstanding balance
  - 3 latest transactions with type, date, amount, and description
- **Reply format (example):**
  ```
  📊 *Status Hutang*

  @reyhan → @budi
  Outstanding: Rp25.000
  3 Transaksi Terakhir:
  🟡 Utang | 10 Mei 10:00 | Rp7.000 | susu
  🟢 Bayar | 10 Mei 09:00 | Rp5.000 | pelunasan
  🟡 Utang | 9 Mei 18:00 | Rp15.000 | kopi
  ```

### 4.10. `.batal <debt_id>`

- **Category:** Core
- **Purpose:** Cancel a debt record (must be the original debtor).
- **Validation:** Only the original debtor (creator) can cancel their own debt.
- **Behavior:** UPDATE `debts.status = 'cancelled'`.
- **Reply:** `"✅ Utang #<id> berhasil dibatalkan"` or `"❌ Utang #<id> tidak ditemukan atau bukan milik Anda"`

### 4.11. `.help`

- **Category:** Public
- **Purpose:** Display list of all available commands.
- **Rate Limit:** 1x per minute per user per group.
- **Access:** Anyone (including unregistered users).
- **Reply:**
  ```
  📋 *Daftar Command*

  .daftar <nama> — Daftar ke bot
  .rename <nama> — Ganti nama
  .utang @user <jumlah> [ket] — Catat hutang
  .bayar @user <jumlah> [ket] — Bayar hutang
  .lunas @user — Lunas semua utang ke user
  .status [@user] — Lihat status hutang
  .batal <id> — Batalkan catatan hutang
  .help — Tampilkan bantuan ini
  ```

---

## 5. Concurrency & Data Integrity

- **SQLite Synchronous Nature:** `better-sqlite3` is fully synchronous. DB operations block the event loop, preventing interleaved unsafe reads/writes.
- **Atomic Transactions:** All read+write operations use `db.transaction()` wrapper for safety.
- **No Race Conditions:** Synchronous DB + transactions guarantee data integrity without external rate limiting.

---

## 6. Session & Authentication

- whatsapp-web.js handles session management via `LocalAuth`.
- Session files stored in `./data/.wwebjs_auth/`.
- On first run: QR code printed to terminal via `qrcode-terminal`.
- Subsequent runs: Session restored automatically.

---

## 7. Project Structure

```
wa-bot-debt-tracker/
├── package.json
├── .gitignore
├── PRD.md
├── src/
│   ├── index.js                # Entry point, client init, message router
│   ├── database.js             # SQLite schema init + DB helpers
│   ├── config.js               # App configuration constants
│   ├── commands/
│   │   ├── index.js            # Command routing map
│   │   ├── help.js             # .help handler
│   │   ├── register.js         # .daftar handler
│   │   ├── rename.js           # .rename handler
│   │   ├── debt.js             # .utang handler
│   │   ├── pay.js              # .bayar handler
│   │   ├── settle.js           # .lunas handler
│   │   ├── status.js           # .status handler
│   │   └── cancel.js           # .batal handler
│   └── utils/
│       ├── balance.js          # Outstanding balance + history queries
│       ├── rate-limiter.js     # Rate limiter for public commands
│       └── parser.js           # Command & mention parsing utilities
├── data/
│   ├── tracker.db              # Auto-generated SQLite DB
│   └── .wwebjs_auth/           # WhatsApp session storage
```

---

## 8. Limitations & Known Issues

| # | Limitation | Notes |
|---|-----------|-------|
| 1 | **Unofficial API risk** | whatsapp-web.js uses WhatsApp Web internally. Account ban is possible, though risk is minimal for small-scale use. |
| 2 | **Phone must stay online** | WhatsApp Web requires the linked phone to have an active internet connection. |
| 3 | **Bot must be group member** | Bot must be added to the group and able to read messages. Only processes group messages. |
| 4 | **No edit capability** | WhatsApp does not support message editing. Typos require re-sending. `.batal` exists for cancelling wrong debts. |
| 5 | **Memory usage** | Puppeteer + Chromium requires ~200-500MB RAM. |
| 6 | **Disappearing messages** | If group enables disappearing messages, bot reads messages in real-time — unaffected. |
| 7 | **Single number, one session** | Bot runs on one WhatsApp number. All commands appear from that number. |
| 8 | **No undo for `.bayar` / `.lunas`** | Payments cannot be undone via command. Only `.batal` cancels debt records (not payments). |
| 9 | **Rate limiter in-memory** | Rate limit resets on bot restart. Consider persistent storage for production use. |

---

## 9. Future Considerations (Out of Scope v1)

- Admin-only commands (force-cancel, clear user data).
- Rich receipts (image/PDF of debt report).
- Monthly/periodic summary broadcasts.
- Web dashboard for viewing debts.

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| Debtor | Person who owes money (pelaku `.utang`). |
| Creditor | Person who is owed money (yang di-mention saat `.utang`). |
| Outstanding balance | `SUM(debts.amount WHERE active) - SUM(payments.amount)` for a given (debtor, creditor, group). |
| Aggregate payment | Payments tracked globally per pair, not linked to a specific debt row. |
| Public command | Command accessible without registration (currently only `.help`). |
| Core command | Command requiring prior `.daftar` registration. |
| Silent | Bot ignores the message and sends no reply. |
