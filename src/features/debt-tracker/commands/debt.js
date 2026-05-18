/**
 * .utang command — Record a new debt.
 */

const { getMentionedId, extractAmount, nowWIB, formatAmount } = require('../../../shared/parser');
const { ensureUser, getOutstandingBalance } = require('../utils');

/**
 * Handle .utang @<mention> <amount> [description].
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handleDebt(msg, args, db, sender, groupId) {
  const mentionedId = getMentionedId(msg);
  if (!mentionedId) {
    msg.reply('❌ Gunakan: .utang @user <jumlah> [keterangan]\nContoh: .utang @reyhan 10000 donat');
    return;
  }

  // Cannot owe yourself
  if (mentionedId === sender.wa_user_id) {
    msg.reply('❌ Tidak bisa mencatat utang ke diri sendiri.');
    return;
  }

  const ts = nowWIB();
  const contactName = msg.mentions?.[0]?.pushname || mentionedId.split('@')[0];

  // Ensure creditor exists (auto-register with WhatsApp name as fallback)
  const creditor = ensureUser(db, mentionedId, contactName, ts);
  if (!creditor) {
    msg.reply('❌ Gagal memproses user yang disebut.');
    return;
  }

  // Filter out mention strings (e.g. @229664853336232) from args before parsing amount
  const cleanArgs = args.filter(a => !a.startsWith('@'));
  const { amount, rest } = extractAmount(cleanArgs);
  if (!amount) {
    msg.reply('❌ Jumlah harus berupa angka positif.\nContoh: .utang @reyhan 10000 donat');
    return;
  }

  const description = rest.join(' ').trim() || null;

  const insertDebt = db.transaction(() => {
    return db.prepare(
      'INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(groupId, sender.id, creditor.id, amount, description, 'active', ts, ts);
  });

  const result = insertDebt();

  const id = result.lastInsertRowid;
  const total = getOutstandingBalance(db, groupId, sender.id, creditor.id);
  const descStr = description ? ` untuk ${description}` : '';
  msg.reply(
    `🟡 Utang #D${id} *Rp${formatAmount(amount)}* ke @${creditor.display_name}${descStr} berhasil dicatat\n` +
    `📝 Total utang saat ini: *Rp${formatAmount(total)}*\n` +
    `💡 untuk membatalkan, kirim *.batal D${id}*\n` +
    `💡 untuk mengubah, kirim *.ubah D${id} <jumlah>*`
  );
}

module.exports = { handleDebt };
