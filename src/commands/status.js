/**
 * .status command — View debt status report (Opsi C: both directions).
 */

const { getUser, getOutstandingBalance, getLatestTransactions, hasInvolvement } = require('../utils/balance');
const { getMentionedId, formatAmount, formatDate } = require('../utils/parser');

/**
 * Handle .status [@<mention>].
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 * @param {number} groupId
 */
function handleStatus(msg, args, db, sender, groupId) {
  const mentionedId = getMentionedId(msg);

  if (mentionedId) {
    // Status for a specific mentioned user
    handleStatusForUser(msg, db, groupId, mentionedId, sender);
  } else {
    // Status for all users
    handleStatusAll(msg, db, groupId, sender);
  }
}

/**
 * Show status for a specific mentioned user (both as debtor and as creditor).
 */
function handleStatusForUser(msg, db, groupId, mentionedId, sender) {
  const targetUser = getUser(db, mentionedId);
  if (!targetUser) {
    msg.reply('❌ User tersebut belum terdaftar.');
    return;
  }

  const lines = [];
  lines.push(`📊 *Status Utang: @${targetUser.display_name}*`);
  lines.push('');

  // Case 1: targetUser as debtor (they owe others)
  const usersOwedTo = db.prepare(`
    SELECT DISTINCT creditor_id FROM debts
    WHERE group_id = ? AND debtor_id = ? AND status = 'active'
  `).all(groupId, targetUser.id);

  for (const row of usersOwedTo) {
    const creditor = db.prepare('SELECT * FROM users WHERE id = ?').get(row.creditor_id);
    if (!creditor) continue;
    const outstanding = getOutstandingBalance(db, groupId, targetUser.id, creditor.id);
    lines.push(`@${targetUser.display_name} → @${creditor.display_name}`);
    lines.push(`Total: Rp${formatAmount(outstanding)}`);
    addTransactions(db, groupId, targetUser.id, creditor.id, lines);
    lines.push('');
  }

  // Case 2: targetUser as creditor (others owe them)
  const debtorsToUser = db.prepare(`
    SELECT DISTINCT debtor_id FROM debts
    WHERE group_id = ? AND creditor_id = ? AND status = 'active'
  `).all(groupId, targetUser.id);

  for (const row of debtorsToUser) {
    const debtor = db.prepare('SELECT * FROM users WHERE id = ?').get(row.debtor_id);
    if (!debtor) continue;
    const outstanding = getOutstandingBalance(db, groupId, debtor.id, targetUser.id);
    lines.push(`@${debtor.display_name} → @${targetUser.display_name}`);
    lines.push(`Total: Rp${formatAmount(outstanding)}`);
    addTransactions(db, groupId, debtor.id, targetUser.id, lines);
    lines.push('');
  }

  if (lines.length <= 2) {
    lines.push('(Tidak ada transaksi)');
  }

  msg.reply(lines.join('\n'));
}

/**
 * Show status for all users in the group.
 */
function handleStatusAll(msg, db, groupId, sender) {
  // Get all unique users involved in debts or payments in this group
  const involvedUsers = db.prepare(`
    SELECT DISTINCT u.id, u.wa_user_id, u.display_name FROM users u
    WHERE u.id IN (
      SELECT debtor_id FROM debts WHERE group_id = ? AND status = 'active'
      UNION
      SELECT creditor_id FROM debts WHERE group_id = ? AND status = 'active'
      UNION
      SELECT payer_id FROM payments WHERE group_id = ?
      UNION
      SELECT receiver_id FROM payments WHERE group_id = ?
    )
  `).all(groupId, groupId, groupId, groupId);

  if (involvedUsers.length === 0) {
    msg.reply('📊 *Status Utang Grup*\n\n(Belum ada catatan)');
    return;
  }

  const lines = ['📊 *Status Utang Grup*', ''];

  // Get all pairs with positive outstanding
  const pairs = db.prepare(`
    SELECT d.debtor_id, d.creditor_id, SUM(d.amount) AS total_debt
    FROM debts d
    WHERE d.group_id = ? AND d.status = 'active'
    GROUP BY d.debtor_id, d.creditor_id
  `).all(groupId);

  // Build payment map
  const payments = db.prepare(`
    SELECT payer_id, receiver_id, SUM(amount) AS total FROM payments WHERE group_id = ? GROUP BY payer_id, receiver_id
  `).all(groupId);

  const payMap = {};
  for (const p of payments) {
    payMap[`${p.payer_id}:${p.receiver_id}`] = p.total;
  }

  for (const pair of pairs) {
    const debtor = db.prepare('SELECT * FROM users WHERE id = ?').get(pair.debtor_id);
    const creditor = db.prepare('SELECT * FROM users WHERE id = ?').get(pair.creditor_id);
    if (!debtor || !creditor) continue;

    const paid = payMap[`${pair.debtor_id}:${pair.creditor_id}`] || 0;
    const outstanding = pair.total_debt - paid;

    lines.push(`@${debtor.display_name} → @${creditor.display_name}`);
    lines.push(`Total: Rp${formatAmount(outstanding > 0 ? outstanding : 0)}`);

    // Always show transactions, even if fully paid (for history)
    addTransactions(db, groupId, pair.debtor_id, pair.creditor_id, lines);
    lines.push('');
  }

  msg.reply(lines.join('\n'));
}

/**
 * Add up to 3 latest transactions for a (debtor, creditor) pair to the lines array.
 */
function addTransactions(db, groupId, debtorId, creditorId, lines) {
  const txns = db.prepare(`
    SELECT 'debt' AS type, id, amount, description, created_at
    FROM debts
    WHERE group_id = ? AND debtor_id = ? AND creditor_id = ? AND status = 'active'
    UNION ALL
    SELECT 'payment' AS type, id, amount, description, created_at
    FROM payments
    WHERE group_id = ? AND payer_id = ? AND receiver_id = ?
    ORDER BY created_at DESC
    LIMIT 3
  `).all(groupId, debtorId, creditorId, groupId, debtorId, creditorId);

  if (txns.length === 0) {
    lines.push('(Tidak ada transaksi)');
    return;
  }

  lines.push('3 Transaksi Terakhir:');
  for (const txn of txns) {
    const typeLabel = txn.type === 'debt' ? '🟡 Utang' : '🟢 Bayar';
    const prefix = txn.type === 'debt' ? 'D' : 'P';
    const idStr = `#${prefix}${txn.id}`;
    const dateStr = formatDate(txn.created_at);
    const desc = txn.description ? ` | ${txn.description}` : '';
    lines.push(`${typeLabel} ${idStr} | ${dateStr} | Rp${formatAmount(txn.amount)}${desc}`);
  }
}

module.exports = { handleStatus };
