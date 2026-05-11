/**
 * .help command — Public, rate-limited to 1x/min.
 */

const config = require('../config');

const PREFIX = config.commandPrefix;

let HELP_TEXT = `📋 *Daftar Command*

${PREFIX}daftar <nama> — Daftar ke bot
${PREFIX}rename <nama> — Ganti nama
${PREFIX}utang @user <jumlah> [ket] — Catat utang (saya utang ke user)
${PREFIX}utangnya @user <jumlah> [ket] — Catat utang dari user (user utang ke saya)
${PREFIX}bayar @user <jumlah> [ket] — Bayar utang
${PREFIX}lunas @user — Lunas semua utang ke user
${PREFIX}status [@user] — Lihat status utang
${PREFIX}batal <id> — Batalkan catatan utang (D1) atau pembayaran (P1)
${PREFIX}ubah <id> <jumlah> [ket] — Ubah jumlah/keterangan utang atau pembayaran`;

if (config.ai.enabled && config.ai.apiUrl) {
  HELP_TEXT += `\n${PREFIX}ai <prompt> — Tanya AI seputar data utang`;
}

HELP_TEXT += `\n${PREFIX}help — Tampilkan bantuan ini`;

/**
 * Handle .help command.
 * @param {object} msg - whatsapp-web.js message object
 */
function handleHelp(msg) {
  msg.reply(HELP_TEXT);
}

module.exports = { handleHelp };
