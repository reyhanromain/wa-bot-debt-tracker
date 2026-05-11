/**
 * .lunas command — Pay off all outstanding balance to a user.
 */

const { getMentionedId, nowWIB, formatAmount } = require('../utils/parser');
const { ensureUser, getOutstandingBalance } = require('../utils/balance');

/**
 * Handle .lunas @<mention>.
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handleSettle(msg, args, db, sender, groupId) {
  const mentionedId = getMentionedId(msg);
  if (!mentionedId) {
    msg.reply('❌ Gunakan: .lunas @user\nContoh: .lunas @reyhan');
    return;
  }

  if (mentionedId === sender.wa_user_id) {
    msg.reply('❌ Tidak bisa melunasi utang ke diri sendiri.');
    return;
  }

  const ts = nowWIB();
  const contactName = msg.mentions?.[0]?.pushname || mentionedId.split('@')[0];
  const receiver = ensureUser(db, mentionedId, contactName, ts);
  if (!receiver) {
    msg.reply('❌ Gagal memproses user yang disebut.');
    return;
  }

  const outstanding = getOutstandingBalance(db, groupId, sender.id, receiver.id);

  if (outstanding <= 0) {
    msg.reply(`ℹ️ Tidak ada utang tersisa ke @${receiver.display_name}.`);
    return;
  }

  const insertPayment = db.transaction(() => {
    return db.prepare(
      'INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(groupId, sender.id, receiver.id, outstanding, 'semua utang lunas', ts);
  });

  const result = insertPayment();

  const settleId = result.lastInsertRowid;
  msg.reply(
    `🟢 Bayar #P${settleId} Rp${formatAmount(outstanding)} ke @${receiver.display_name} berhasil dicatat\n` +
    `✅ Semua utang lunas\n` +
    `💡 untuk membatalkan, kirim *.batal P${settleId}*\n` +
    `💡 untuk mengubah, kirim *.ubah P${settleId} <jumlah>*`
  );
}

module.exports = { handleSettle };
