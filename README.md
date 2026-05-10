# WhatsApp Debt Tracker Bot

Bot WhatsApp grup untuk mencatat dan mengelola utang antar anggota grup. Dibangun dengan [whatsapp-web.js](https://wwebjs.dev) dan SQLite.

## Fitur

- 📝 Catat utang ke anggota grup
- 💰 Bayar utang (parsial maupun lunas)
- 📊 Lihat status utang (per user atau semua)
- 🗑️ Batalkan catatan utang atau pembayaran
- 👤 Daftar dengan nama panggilan
- ⏱️ Rate limit untuk command public (cegah spam)
- 📋 Log harian (terminal + file)

## Prasyarat

- Node.js v18+
- npm
- Nomor WhatsApp aktif (untuk scan QR)
- Chrome/Chromium (diinstal otomatis oleh Puppeteer)

## Instalasi

```bash
# Clone/download project
cd wa-bot-debt-tracker

# Install dependencies
npm install

# Jalankan bot
npm start
```

## Penggunaan

### Pertama Kali

1. Jalankan `npm start` atau `npm run dev`
2. Scan QR code yang muncul di terminal dengan WhatsApp Anda (WA > Setelan > Perangkat Tertaut)
3. Bot akan menyimpan session — restart berikutnya tidak perlu scan ulang
4. Tambahkan bot ke grup WhatsApp

### Command

#### `.daftar <nama>`
Daftar ke bot dengan nama panggilan. **Wajib** sebelum bisa menggunakan command lain.
```
.daftar Reyhan
👤 Berhasil mendaftar dengan nama *Reyhan*
```

#### `.rename <nama>`
Ganti nama panggilan.
```
.rename Budi
👤 Nama berhasil diubah menjadi *Budi*
```

#### `.utang @<mention> <jumlah> [keterangan]`
Catat utang baru ke anggota yang di-mention.
```
.utang @budi 10000 donat
🟡 Utang #D1 *Rp10.000* ke @budi untuk donat berhasil dicatat
📝 Total utang saat ini: *Rp10.000*
💡 untuk membatalkan, kirim *.batal D1*
```

#### `.bayar @<mention> <jumlah> [keterangan]`
Bayar utang ke anggota yang di-mention. Bisa parsial.
```
.bayar @budi 5000 bayar donat
🟢 Bayar #P2 *Rp5.000* ke @budi terkait bayar donat berhasil dicatat
📝 Total utang saat ini: *Rp5.000*
💡 untuk membatalkan, kirim *.batal P2*
```

#### `.lunas @<mention>`
Lunasi semua utang yang tersisa ke anggota yang di-mention.
```
.lunas @budi
🟢 Bayar #P3 Rp3.000 ke @budi berhasil dicatat
✅ Semua utang lunas
💡 untuk membatalkan, kirim *.batal P3*
```

#### `.status [@<mention>]`
Lihat laporan utang. Tanpa mention → tampilkan semua. Dengan mention → tampilkan spesifik user.
```
.status
📊 *Status Utang Grup*

@reyhan → @budi
Total: Rp15.000
3 Transaksi Terakhir:
🟡 Utang #D1 | 10 Mei 07:44 | Rp5.000
🟢 Bayar #P2 | 10 Mei 07:44 | Rp3.000 | parkir
```

#### `.batal <id>`
Batalkan catatan utang (`D<id>`) atau pembayaran (`P<id>`). Hanya pembuat yang bisa membatalkan.
```
.batal D1
🗑️ Utang #D1 berhasil dibatalkan.

.batal P2
🗑️ Pembayaran #P2 berhasil dibatalkan.
```

#### `.help`
Tampilkan daftar semua command.
```
.help
📋 *Daftar Command*
...
```

## Struktur Project

```
wa-bot-debt-tracker/
├── package.json
├── .gitignore
├── README.md
├── PRD.md
├── test-init.js                    # Test script (npm test)
├── src/
│   ├── index.js                    # Entry point, message router
│   ├── config.js                   # App configuration
│   ├── database.js                 # SQLite schema init
│   ├── commands/
│   │   ├── index.js                # Command routing map
│   │   ├── help.js                 # .help
│   │   ├── register.js             # .daftar
│   │   ├── rename.js               # .rename
│   │   ├── debt.js                 # .utang
│   │   ├── pay.js                  # .bayar
│   │   ├── settle.js               # .lunas
│   │   ├── status.js               # .status
│   │   └── cancel.js               # .batal
│   └── utils/
│       ├── balance.js              # Balance calculation & queries
│       ├── parser.js               # Command & mention parsing
│       ├── rate-limiter.js         # In-memory rate limiter
│       └── logger.js               # File + terminal logger
└── data/
    ├── tracker.db                  # SQLite database (auto-generated)
    ├── logs/                       # Log harian (auto-generated)
    │   └── YYYY-MM-DD.log
    └── .wwebjs_auth/               # WhatsApp session (auto-generated)
        └── session/
```

## Development

```bash
# Jalankan dengan auto-restart saat ada perubahan file
npm run dev

# Test tpa sentuh database produksi
npm test

# Hapus session & log (database AMAN)
rm -rf data/logs data/.wwebjs_auth
```

## Teknologi

- **[whatsapp-web.js](https://wwebjs.dev)** — WhatsApp Web automation
- **Puppeteer** — Headless browser (via whatsapp-web.js)
- **better-sqlite3** — SQLite synchronous driver
- **qrcode-terminal** — QR code display in terminal
- **nodemon** — Auto-restart during development

## Limitasi

- whatsapp-web.js adalah unofficial API — ada risiko kecil akun terbanned
- Nomor WhatsApp yang terhubung harus online selama bot berjalan
- Membutuhkan ~200-500MB RAM (Chromium)
- Pembayaran yang sudah dicatat tidak bisa diedit, hanya bisa dibatalkan
- Rate limit bersifat in-memory (hilang saat bot restart)
