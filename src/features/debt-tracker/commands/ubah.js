const { parseAmountString, nowWIB, formatAmount } = require('../../../shared/parser');
const { getOutstandingBalance } = require('../utils');

function handleUbah(msg, args, db, sender, groupId) {
  const idStr = args[0];
  if (!idStr) {
    msg.reply('❌ Gunakan: .ubah <id> <jumlah> [keterangan]\nContoh: .ubah D1 15000 atau .ubah P1 5000');
    return;
  }

  const upper = idStr.toUpperCase();
  let type, cleanId;

  if (/^#?P(\d+)$/.test(upper)) {
    type = 'payment';
    cleanId = upper.replace(/^#?P/, '');
  } else {
    type = 'debt';
    cleanId = upper.replace(/^#?D/, '');
  }

  const recordId = parseInt(cleanId, 10);
  if (isNaN(recordId) || recordId <= 0) {
    msg.reply('❌ ID tidak valid. Gunakan: .ubah D1 (utang) atau .ubah P1 (pembayaran)');
    return;
  }

  const amount = parseAmountString(args[1]);
  if (!amount) {
    msg.reply('❌ Jumlah harus berupa angka positif.\nContoh: .ubah D1 15000');
    return;
  }

  const description = args.slice(2).join(' ').trim() || null;

  if (type === 'debt') {
    updateDebt(msg, db, sender, groupId, recordId, amount, description);
  } else {
    updatePayment(msg, db, sender, groupId, recordId, amount, description);
  }
}

function updateDebt(msg, db, sender, groupId, debtId, newAmount, description) {
  const debt = db.prepare(`
    SELECT * FROM debts WHERE id = ? AND group_id = ? AND status = 'active'
  `).get(debtId, groupId);

  if (!debt) {
    msg.reply(`❌ Utang #D${debtId} tidak ditemukan atau sudah dibatalkan.`);
    return;
  }

  if (debt.debtor_id !== sender.id) {
    msg.reply(`❌ Utang #D${debtId} bukan milik Anda.`);
    return;
  }

  const current = getOutstandingBalance(db, groupId, debt.debtor_id, debt.creditor_id);
  const balanceWithout = current - debt.amount;

  if (balanceWithout + newAmount < 0) {
    const minAllowed = debt.amount - current;
    msg.reply(`❌ Jumlah tidak valid. Minimal Rp${formatAmount(minAllowed)} agar total utang tidak minus.`);
    return;
  }

  const ts = nowWIB();
  const updateFields = description !== null
    ? 'UPDATE debts SET amount = ?, description = ?, updated_at = ? WHERE id = ?'
    : 'UPDATE debts SET amount = ?, updated_at = ? WHERE id = ?';
  const params = description !== null
    ? [newAmount, description, ts, debtId]
    : [newAmount, ts, debtId];

  db.prepare(updateFields).run(...params);

  const total = getOutstandingBalance(db, groupId, debt.debtor_id, debt.creditor_id);
  const descStr = description !== null ? ` keterangan: ${description}` : '';
  msg.reply(
    `🔄 Utang #D${debtId} diubah menjadi *Rp${formatAmount(newAmount)}*${descStr}\n` +
    `📝 Total utang saat ini: *Rp${formatAmount(total)}*`
  );
}

function updatePayment(msg, db, sender, groupId, paymentId, newAmount, description) {
  const payment = db.prepare(`
    SELECT * FROM payments WHERE id = ? AND group_id = ?
  `).get(paymentId, groupId);

  if (!payment) {
    msg.reply(`❌ Pembayaran #P${paymentId} tidak ditemukan.`);
    return;
  }

  if (payment.payer_id !== sender.id) {
    msg.reply(`❌ Pembayaran #P${paymentId} bukan milik Anda.`);
    return;
  }

  const current = getOutstandingBalance(db, groupId, payment.payer_id, payment.receiver_id);
  const balanceWithout = current + payment.amount;

  if (balanceWithout - newAmount < 0) {
    const maxAllowed = current + payment.amount;
    msg.reply(`❌ Jumlah melebihi sisa utang. Maksimal Rp${formatAmount(maxAllowed)}.`);
    return;
  }

  const updateFields = description !== null
    ? 'UPDATE payments SET amount = ?, description = ? WHERE id = ? AND group_id = ?'
    : 'UPDATE payments SET amount = ? WHERE id = ? AND group_id = ?';
  const params = description !== null
    ? [newAmount, description, paymentId, groupId]
    : [newAmount, paymentId, groupId];

  db.prepare(updateFields).run(...params);

  const remaining = getOutstandingBalance(db, groupId, payment.payer_id, payment.receiver_id);
  const descStr = description !== null ? ` keterangan: ${description}` : '';
  msg.reply(
    `🔄 Pembayaran #P${paymentId} diubah menjadi *Rp${formatAmount(newAmount)}*${descStr}\n` +
    `📝 Total utang saat ini: *Rp${formatAmount(remaining)}*`
  );
}

module.exports = { handleUbah };
