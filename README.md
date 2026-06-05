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
| `AI_CONTEXT_MAX_ROWS` | ❌ | — | Maks rows per table untuk AI context |

## Penggunaan

### Operasional Bot

Gunakan helper `bot.sh` untuk menjalankan bot harian agar output terminal seperti QR code tersimpan dan proses bisa dicegah dari sleep/suspend.

| Command | Deskripsi |
|---------|-----------|
| `./bot.sh status` | Cek PID, proses `node`, inhibitor sleep, dan log app terbaru |
| `./bot.sh start` | Jalankan bot detached/background dengan `systemd-inhibit` jika tersedia |
| `./bot.sh stop` | Stop bot managed maupun proses `node src/index.js` yang orphan |
| `./bot.sh restart` | Stop lalu start ulang dalam managed mode |
| `./bot.sh logs` | Tampilkan tail log app harian dan console log |
| `./bot.sh tail` | Follow `data/logs/bot-console.log` |
| `./bot.sh foreground` | Jalankan di terminal aktif untuk scan QR manual |

Log penting:
- App log harian: `data/logs/YYYY-MM-DD.log`
- Output terminal detached termasuk QR: `data/logs/bot-console.log`
- PID managed mode: `data/bot.pid`

Jika bot tidak merespon dan log berulang `QR code displayed — waiting for scan`, jalankan:

```bash
./bot.sh stop
./bot.sh foreground
```

Scan QR di terminal. Setelah muncul `Authentication successful` dan `Bot ready`, tekan `Ctrl+C`, lalu jalankan kembali:

```bash
./bot.sh start
```

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
