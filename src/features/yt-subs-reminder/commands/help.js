const config = require('../../../config');

function handleHelp(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  msg.reply(`📋 *YouTube Premium — Commands*

.saldo — Lihat saldo semua member
.topup @user <nominal> — Tambah saldo member
.tsx [n] — Lihat n transaksi terakhir (default 5)
.member new @user <nama> — Tambah member
.member edit-name <lama> <baru> — Ganti nama
.member edit-user <nama> @user — Link WA user (atau "me")
.member remove @user — Hapus member
.help — Tampilkan bantuan ini`);
}

module.exports = { handleHelp };
