/**
 * .batal command — Cancel a debt (#D<id>) or a payment (#P<id>).
 * Only the original creator (debtor/payer) can cancel their own record.
 */

const { nowWIB } = require('../utils/parser');

/**
 * Handle .batal <id>.
 * Supports: "1", "D1", "#D1" (debt), "P1", "#P1" (payment).
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handleCancel(msg, args, db, sender, groupId) {
  const idStr = args[0];
  if (!idStr) {
    msg.reply('❌ Gunakan: .batal <id>\nContoh: .batal D1 atau .batal P1\nCek id dari .status');
    return;
  }

  // Detect type: starts with P/p = payment, D/d or plain number = debt
  const upper = idStr.toUpperCase();
  let type, cleanId;

  if (/^#?P(\d+)$/.test(upper)) {
    // Payment cancel: P1, #P1
    type = 'payment';
    cleanId = upper.replace(/^#?P/, '');
  } else {
    // Debt cancel: D1, #D1, or just plain "1"
    type = 'debt';
    cleanId = upper.replace(/^#?D/, '');
  }

  const recordId = parseInt(cleanId, 10);
  if (isNaN(recordId) || recordId <= 0) {
    msg.reply('❌ ID tidak valid. Gunakan: .batal D1 (utang) atau .batal P1 (pembayaran)');
    return;
  }

  if (type === 'debt') {
    cancelDebt(msg, db, sender, groupId, recordId);
  } else {
    cancelPayment(msg, db, sender, groupId, recordId);
  }
}

/**
 * Cancel a debt record (mark as cancelled).
 */
function cancelDebt(msg, db, sender, groupId, debtId) {
  const debt = db.prepare(`
    SELECT * FROM debts WHERE id = ? AND group_id = ? AND status = 'active'
  `).get(debtId, groupId);

  if (!debt) {
    msg.reply(`❌ Utang #D${debtId} tidak ditemukan atau sudah dibatalkan.`);
    return;
  }

  if (debt.debtor_id !== sender.id) {
    msg.reply(`❌ Utang #D${debtId} bukan milik Anda. Hanya pembuat utang yang bisa membatalkan.`);
    return;
  }

  const ts = nowWIB();
  db.prepare(
    'UPDATE debts SET status = ?, updated_at = ? WHERE id = ?'
  ).run('cancelled', ts, debtId);

  msg.reply(
    `🗑️ Utang #D${debtId} berhasil dibatalkan.\n` +
    `💡 Alternatif: jika hanya ingin mengubah jumlah, gunakan *.ubah D${debtId} <jumlah>*`
  );
}

/**
 * Cancel a payment record (delete from database).
 */
function cancelPayment(msg, db, sender, groupId, paymentId) {
  const payment = db.prepare(`
    SELECT * FROM payments WHERE id = ? AND group_id = ?
  `).get(paymentId, groupId);

  if (!payment) {
    msg.reply(`❌ Pembayaran #P${paymentId} tidak ditemukan.`);
    return;
  }

  if (payment.payer_id !== sender.id) {
    msg.reply(`❌ Pembayaran #P${paymentId} bukan milik Anda. Hanya pembayar yang bisa membatalkan.`);
    return;
  }

  const deletePayment = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ? AND group_id = ?').run(paymentId, groupId);
  });

  deletePayment();

  msg.reply(
    `🗑️ Pembayaran #P${paymentId} berhasil dibatalkan.\n` +
    `💡 Alternatif: jika hanya ingin mengubah jumlah, gunakan *.ubah P${paymentId} <jumlah>*`
  );
}

module.exports = { handleCancel };
