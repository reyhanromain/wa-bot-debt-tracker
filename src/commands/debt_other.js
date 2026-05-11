/**
 * .utangnya command — Record a new debt from mentioned user to sender.
 * Kebalikan dari .utang: yang di-mentionlah yang berutang ke pengirim.
 */

const { getMentionedId, extractAmount, nowWIB, formatAmount } = require('../utils/parser');
const { ensureUser, getOutstandingBalance } = require('../utils/balance');

/**
 * Handle .utangnya @<mention> <amount> [description].
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handleDebtOther(msg, args, db, sender, groupId) {
  const mentionedId = getMentionedId(msg);
  if (!mentionedId) {
    msg.reply('❌ Gunakan: .utangnya @user <jumlah> [keterangan]\nContoh: .utangnya @reyhan 10000 donat');
    return;
  }

  // Cannot record debt from yourself to yourself
  if (mentionedId === sender.wa_user_id) {
    msg.reply('❌ Tidak bisa mencatat utang dari diri sendiri.');
    return;
  }

  const ts = nowWIB();
  const contactName = msg.mentions?.[0]?.pushname || mentionedId.split('@')[0];

  // Ensure debtor exists (auto-register with WhatsApp name as fallback)
  const debtor = ensureUser(db, mentionedId, contactName, ts);
  if (!debtor) {
    msg.reply('❌ Gagal memproses user yang disebut.');
    return;
  }

  // Filter out mention strings from args before parsing amount
  const cleanArgs = args.filter(a => !a.startsWith('@'));
  const { amount, rest } = extractAmount(cleanArgs);
  if (!amount) {
    msg.reply('❌ Jumlah harus berupa angka positif.\nContoh: .utangnya @reyhan 10000 donat');
    return;
  }

  const description = rest.join(' ').trim() || null;

  const insertDebt = db.transaction(() => {
    return db.prepare(
      'INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(groupId, debtor.id, sender.id, amount, description, 'active', ts, ts);
  });

  const result = insertDebt();

  const id = result.lastInsertRowid;
  const total = getOutstandingBalance(db, groupId, debtor.id, sender.id);
  const descStr = description ? ` untuk ${description}` : '';
  msg.reply(
    `🟡 Utang #D${id} *Rp${formatAmount(amount)}* ke @${sender.display_name}${descStr} berhasil dicatat (dari @${debtor.display_name})\n` +
    `📝 Total utang @${debtor.display_name} saat ini: *Rp${formatAmount(total)}*\n` +
    `💡 untuk membatalkan, kirim *.batal D${id}*`
  );
}

module.exports = { handleDebtOther };
