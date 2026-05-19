function handleHelp(msg, args, db) {

  msg.reply(`📋 *YouTube Premium — Commands*

.saldo — Lihat saldo semua member
.topup @user <nominal> — Tambah saldo member
.tsx [n] — Lihat n transaksi terakhir (default 3)
.member new @user <nama> — Tambah member
.member edit-name <lama> <baru> — Ganti nama
.member edit-user <nama> @user — Link WA user (atau "me")
.member remove @user — Hapus member
.help — Tampilkan bantuan ini`);
}

module.exports = { handleHelp };
