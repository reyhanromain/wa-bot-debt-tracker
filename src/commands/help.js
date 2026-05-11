/**
 * .help command — Public, rate-limited to 1x/min.
 */

const config = require('../config');

const HELP_TEXT = `📋 *Daftar Command*

${config.commandPrefix}daftar <nama> — Daftar ke bot
${config.commandPrefix}rename <nama> — Ganti nama
${config.commandPrefix}utang @user <jumlah> [ket] — Catat utang (saya utang ke user)
${config.commandPrefix}utangnya @user <jumlah> [ket] — Catat utang dari user (user utang ke saya)
${config.commandPrefix}bayar @user <jumlah> [ket] — Bayar utang
${config.commandPrefix}lunas @user — Lunas semua utang ke user
${config.commandPrefix}status [@user] — Lihat status utang
${config.commandPrefix}batal <id> — Batalkan catatan utang (D1) atau pembayaran (P1)
${config.commandPrefix}ubah <id> <jumlah> [ket] — Ubah jumlah/keterangan utang atau pembayaran
${config.commandPrefix}help — Tampilkan bantuan ini`;

/**
 * Handle .help command.
 * @param {object} msg - whatsapp-web.js message object
 */
function handleHelp(msg) {
  msg.reply(HELP_TEXT);
}

module.exports = { handleHelp };
