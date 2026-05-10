/**
 * .bayar command — Record a payment toward outstanding balance.
 */

const { getMentionedId, extractAmount, nowWIB, formatAmount } = require('../utils/parser');
const { ensureUser, getOutstandingBalance } = require('../utils/balance');

/**
 * Handle .bayar @<mention> <amount> [description].
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handlePay(msg, args, db, sender, groupId) {
  const mentionedId = getMentionedId(msg);
  if (!mentionedId) {
    msg.reply('❌ Gunakan: .bayar @user <jumlah> [keterangan]\nContoh: .bayar @reyhan 5000');
    return;
  }

  if (mentionedId === sender.wa_user_id) {
    msg.reply('❌ Tidak bisa membayar utang ke diri sendiri.');
    return;
  }

  const ts = nowWIB();
  const contactName = msg.mentions?.[0]?.pushname || mentionedId.split('@')[0];
  const receiver = ensureUser(db, mentionedId, contactName, ts);
  if (!receiver) {
    msg.reply('❌ Gagal memproses user yang disebut.');
    return;
  }

  // Filter out mention strings from args before parsing amount
  const cleanArgs = args.filter(a => !a.startsWith('@'));
  const { amount, rest } = extractAmount(cleanArgs);
  if (!amount) {
    msg.reply('❌ Jumlah harus berupa angka positif.\nContoh: .bayar @reyhan 5000');
    return;
  }

  const description = rest.join(' ').trim() || null;

  // Check outstanding balance
  const outstanding = getOutstandingBalance(db, groupId, sender.id, receiver.id);
  if (outstanding <= 0) {
    msg.reply(`ℹ️ Tidak ada utang tersisa ke @${receiver.display_name}.`);
    return;
  }

  if (amount > outstanding) {
    msg.reply(`❌ Jumlah pembayaran (Rp${formatAmount(amount)}) melebihi sisa utang (Rp${formatAmount(outstanding)}).`);
    return;
  }

  const insertPayment = db.transaction(() => {
    return db.prepare(
      'INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(groupId, sender.id, receiver.id, amount, description, ts);
  });

  const result = insertPayment();

  const payId = result.lastInsertRowid;
  const remaining = outstanding - amount;
  const descStr = description ? ` terkait ${description}` : '';
  msg.reply(
    `🟢 Bayar #P${payId} *Rp${formatAmount(amount)}* ke @${receiver.display_name}${descStr} berhasil dicatat\n` +
    `📝 Total utang saat ini: *Rp${formatAmount(remaining)}*\n` +
    `💡 untuk membatalkan, kirim *.batal P${payId}*`
  );
}

module.exports = { handlePay };
