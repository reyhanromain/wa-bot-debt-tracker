# WhatsApp Personal Assistant Bot

Bot WhatsApp personal assistant dengan arsitektur multi-fitur. Setiap grup hanya bisa menggunakan 1 fitur (exclusive binding). Dibangun dengan [whatsapp-web.js](https://wwebjs.dev) dan SQLite.

## Fitur Tersedia

### debt-tracker
Pencatat utang antar anggota grup.
- 📝 Catat utang ke anggota grup
- 💰 Bayar utang (parsial maupun lunas)
- 📊 Lihat status utang (per user atau semua)
- 🗑️ Batalkan/ubah catatan utang atau pembayaran
- 👤 Daftar dengan nama panggilan
- 🤖 AI query seputar data utang

### yt-subs-reminder
Pengingat tagihan YouTube Premium Family.
- 📅 Auto-billing setiap tgl 14 (kurangi saldo 31rb/member)
- 💰 Topup saldo member
- 📊 Lihat saldo & riwayat transaksi
- 👥 Manage member (CRUD + link WA user)
- ⚠️ Mention otomatis jika saldo minus saat billing

## Arsitektur

Bot menggunakan **feature-based architecture**:
- **1 grup = 1 fitur** — setiap grup hanya bisa menggunakan 1 fitur pada satu waktu
- **`.assist`** — satu-satunya global command (super admin only) untuk manage fitur per grup
- **Feature gate** — grup tanpa fitur aktif akan silent ignore semua command
- **Scheduler** — infrastruktur cron job per fitur (croner)

## Prasyarat

- Node.js v18+
- npm
- Nomor WhatsApp aktif (untuk scan QR)

## Instalasi

```bash
cd wa-bot-debt-tracker
npm install
cp .env.example .env
# Edit .env — isi SUPER_ADMIN_USER_ID
npm start
```

## Konfigurasi

| Variable | Wajib? | Default | Deskripsi |
|----------|--------|---------|-----------|
| `SUPER_ADMIN_USER_ID` | ❌ | — | `users.id` dari database. Diperlukan untuk `.assist` command. |
| `AI_ENABLED` | ❌ | `false` | Aktifkan fitur AI |
| `AI_PROVIDER` | ❌ | `ollama` | Provider AI |
| `AI_MODEL` | ❌ | `llama3.2` | Model AI |
| `AI_API_URL` | ❌ | `http://localhost:11434/v1` | Base URL API |
| `AI_API_KEY` | ❌ | — | API key (kosongkan untuk Ollama) |
| `NOTIFY_TELEGRAM_TOKEN` | ❌ | — | Token bot Telegram untuk notifikasi & kirim QR jarak jauh |
| `NOTIFY_TELEGRAM_CHAT_ID` | ❌ | — | Chat ID Telegram penerima alert |

> Catatan AI: model harus mendukung OpenAI-style function calling (contoh: `deepseek-chat`, `llama3.1`, `qwen2.5`). AI memanggil tools read-only ke database via `src/features/debt-tracker/ai-tools.js` — tidak ada dump data ke context.

## Penggunaan

### Operasional Bot

`bot.sh` adalah wrapper systemd `--user`. Pertama kali `start`, ia akan auto-install unit file di `~/.config/systemd/user/wa-bot.service`. Setelah itu bot auto-restart kalau crash, dan (dengan `enable`) auto-start saat boot.

| Command | Deskripsi |
|---------|-----------|
| `./bot.sh start` | Install unit (sekali) + start bot |
| `./bot.sh stop` | Stop bot |
| `./bot.sh restart` | Restart bot |
| `./bot.sh status` | Systemd state, linger, log app terbaru |
| `./bot.sh enable` | Aktifkan auto-start saat boot (memanggil `sudo loginctl enable-linger`) |
| `./bot.sh disable` | Matikan auto-start saat boot |
| `./bot.sh logs` | Tail `data/logs/<today>.log` + `bot-console.log` |
| `./bot.sh tail` | Follow `data/logs/bot-console.log` |
| `./bot.sh journal` | 100 baris terakhir dari `journalctl --user -u wa-bot.service` |
| `./bot.sh foreground` | Jalankan `node` langsung — dipakai untuk first-time QR scan |
| `./bot.sh uninstall` | Stop + hapus unit file |

Log penting:
- App log harian: `data/logs/YYYY-MM-DD.log`
- Output stdout/stderr (termasuk QR): `data/logs/bot-console.log`
- Unit file: `~/.config/systemd/user/wa-bot.service`

### Recovery saat WA disconnect / auth expired

Bot otomatis exit non-zero pada `disconnected`, `auth_failure`, `uncaughtException`, atau setelah 3× heartbeat fail (cek `client.getState()` tiap 120 detik). systemd respawn dalam 10 detik dengan backoff. Untuk auth expired, dibutuhkan re-scan QR — lihat Telegram notifier di bawah.

### Telegram notifier (re-scan QR jarak jauh)

Saat sesi WA mati & butuh QR baru, bot mengirim QR sebagai PNG ke chat Telegram yang dikonfigurasi.

Setup:
1. Chat `@BotFather` → `/newbot` → catat token.
2. Chat bot baru itu dari HP-mu, kirim apapun.
3. `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` → cari `chat.id`.
4. Isi `.env`:
   ```env
   NOTIFY_TELEGRAM_TOKEN=12345:ABC...
   NOTIFY_TELEGRAM_CHAT_ID=987654321
   ```

Saat keluar rumah dan QR muncul di Telegram-mu, butuh **layar kedua** (tablet, HP lain, atau laptop teman) untuk menampilkan PNG QR sambil kamu scan dari WhatsApp di HP utama (Linked Devices → Link a Device).

Notifier disable otomatis kalau dua env var tsb kosong — bot tetap jalan, alert hanya muncul di log lokal.

### Scheduled job yang gagal

Job yang melempar exception **tidak** menulis `scheduled_runs` dan tidak di-log sebagai `completed` — supaya job gagal tidak terlihat seperti sukses saat log diperiksa. Errornya di-log dan dikirim ke Telegram lewat `alertJobFailure()`.

Khusus `yt-billing`: pemotongan saldo dan pengiriman pengumuman adalah dua tahap terpisah. Kalau saldo sudah terpotong tapi pengumuman gagal terkirim, job melempar exception dengan daftar grup yang gagal — jadi jangan pakai `.billing` manual untuk "mengulang", karena guard "sudah dilakukan bulan ini" akan menolaknya dan saldo memang sudah terpotong.

Pengiriman terjadwal memakai `client.sendMessage(groupId, ...)`, **bukan** `getChatById(...).sendMessage(...)`. Membangun Chat model untuk grup menyentuh jalur group-metadata WhatsApp Web yang bisa melempar `DataError` di build WA Web tertentu; `sendMessage` melewatinya.

### Kalau bot diam di satu grup saja

Kalau bot membalas di grup lain tapi bisu di satu grup (pesan keluar mengendap di ACK 0), grup itu kemungkinan belum ter-sync ke sesi web — biasanya terjadi setelah re-scan QR pada grup yang lama tidak aktif. Kirim satu pesan di grup tersebut dari HP-mu untuk memaksa sync, lalu coba lagi.

### Setup Awal

1. Jalankan `./bot.sh foreground`, scan QR code
2. Tambahkan bot ke grup WhatsApp
3. Daftar sebagai user: `.daftar <nama>`
4. Cek database untuk `users.id` Anda, masukkan ke `.env` sebagai `SUPER_ADMIN_USER_ID`
5. Restart bot dengan `./bot.sh restart`
6. Di grup, jalankan: `.assist set debt-tracker`

### Command Global

| Command | Akses | Deskripsi |
|---------|-------|-----------|
| `.assist status` | Super admin | Lihat fitur aktif di grup |
| `.assist set <feature>` | Super admin | Aktifkan fitur di grup |
| `.assist none` | Super admin | Hapus fitur dari grup |

### Command debt-tracker

| Command | Deskripsi |
|---------|-----------|
| `.daftar <nama>` | Daftar ke bot |
| `.rename <nama>` | Ganti nama |
| `.utang @user <jumlah> [ket]` | Catat utang |
| `.utangnya @user <jumlah> [ket]` | Catat utang dari user |
| `.bayar @user <jumlah> [ket]` | Bayar utang |
| `.bayarin @userX ke @userY <jumlah> [ket]` | Bayarkan utang user lain |
| `.lunas @user` | Lunas semua utang |
| `.lunasin @userX ke @userY [ket]` | Lunasi utang user lain |
| `.status [@user]` | Lihat status utang |
| `.batal <id>` | Batalkan catatan (D1/P1) |
| `.ubah <id> <jumlah> [ket]` | Ubah jumlah |
| `.help` | Tampilkan bantuan |
| `.ai <prompt>` | Tanya AI (jika enabled) |

### Command yt-subs-reminder

| Command | Akses | Deskripsi |
|---------|-------|-----------|
| `.saldo` | Semua | Lihat saldo semua member |
| `.tsx [n]` | Semua | Riwayat transaksi (default 3, maks 8) |
| `.help` | Semua | Tampilkan bantuan |
| `.topup @user <nominal>` | Super admin | Tambah saldo member |
| `.member new @user <nama>` | Super admin | Tambah member |
| `.member edit-name <lama> <baru>` | Super admin | Ganti nama member |
| `.member edit-user <nama> @user/me` | Super admin | Link WA user |
| `.member remove @user` | Super admin | Hapus member |

### Format Jumlah

| Format | Contoh | Hasil |
|--------|--------|-------|
| Biasa | `10000` | 10.000 |
| Titik ribuan | `10.000` | 10.000 |
| Ribuan (k/rb) | `2k`, `3rb` | 2.000, 3.000 |
| Jutaan (jt/juta/m) | `4jt`, `5m` | 4.000.000, 5.000.000 |
| Miliaran (mil/miliar) | `2mil` | 2.000.000.000 |
| Koma desimal | `1,5rb` | 1.500 |
| Slang Hokkien | `goceng`, `ceban`, `cepek` | 5.000, 10.000, 100.000 |

## Struktur Project

```
wa-bot-debt-tracker/
├── bot.sh                          # Helper start/stop/logs/QR foreground
├── package.json
├── .env.example
├── src/
│   ├── index.js                    # Entry point
│   ├── config.js                   # App configuration
│   ├── core/
│   │   ├── db.js                   # SQLite init + shared schema
│   │   ├── router.js               # Message routing + feature gate
│   │   ├── feature-loader.js       # Auto-discover features
│   │   ├── scheduler.js            # Cron job runner (croner)
│   │   ├── rate-limiter.js         # In-memory rate limiter
│   │   └── logger.js               # File + terminal logger
│   ├── commands/
│   │   └── assist.js               # Global command (super admin)
│   ├── shared/
│   │   └── parser.js               # Command & amount parsing
│   ├── utils/
│   │   └── ai.js                   # OpenAI-compatible client
│   └── features/
│       ├── debt-tracker/
│       │   ├── index.js            # Feature manifest
│       │   ├── schema.js           # debts + payments tables
│       │   ├── utils.js            # Balance calculations
│       │   └── commands/           # All debt-tracker commands
│       └── yt-subs-reminder/
│           ├── index.js            # Feature manifest + billing scheduler
│           ├── schema.js           # yt_members + yt_transactions tables
│           └── commands/           # member, topup, saldo, tsx, help
└── data/
    ├── tracker.db                  # SQLite database
    ├── logs/                       # Daily app logs + bot-console.log
    ├── bot.pid                     # PID managed mode dari bot.sh
    └── .wwebjs_auth/               # WhatsApp session
```

## Menambah Fitur Baru

Buat folder di `src/features/<nama-fitur>/` dengan `index.js` yang mengekspor:

```js
module.exports = {
  name: 'nama-fitur',
  description: 'Deskripsi fitur',
  initSchema(db) { /* CREATE TABLE IF NOT EXISTS ... */ },
  commands: {
    command_name: { handler, requiresRegistration, rateLimit, help },
  },
  schedules: [
    // { name: 'job-name', cron: '0 9 14 * *', tz: 'Asia/Jakarta', run: async (ctx) => {} }
  ],
};
```

Lalu assign ke grup via `.assist set nama-fitur`.

## Development

```bash
npm run dev    # Auto-restart via nodemon
npm test       # Unit test
```

## Teknologi

- **whatsapp-web.js** — WhatsApp Web automation
- **better-sqlite3** — SQLite synchronous driver
- **croner** — Cron scheduler (timezone-aware)
- **openai** — AI client (OpenAI-compatible)
- **qrcode-terminal** — QR code display
- **nodemon** — Auto-restart (dev)
