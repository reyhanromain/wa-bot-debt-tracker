function ensureGroup(db, waGroupId, groupName, timestamp) {
  const existing = db.prepare('SELECT id FROM groups WHERE wa_group_id = ?').get(waGroupId);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO groups (wa_group_id, name, created_at) VALUES (?, ?, ?)').run(waGroupId, groupName, timestamp);
  return info.lastInsertRowid;
}

function ensureUser(db, waUserId, defaultName, timestamp) {
  const existing = db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(waUserId, defaultName, timestamp, timestamp);
  return db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId);
}

function getUser(db, waUserId) {
  return db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId) || null;
}

function getOutstandingBalance(db, groupId, debtorId, creditorId) {
  const totalDebt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM debts
    WHERE group_id = ? AND debtor_id = ? AND creditor_id = ? AND status = 'active'
  `).get(groupId, debtorId, creditorId);
  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments
    WHERE group_id = ? AND payer_id = ? AND receiver_id = ?
  `).get(groupId, debtorId, creditorId);
  const balance = totalDebt.total - totalPaid.total;
  return balance > 0 ? balance : 0;
}

function getAllOutstandingBalances(db, groupId) {
  const debts = db.prepare(`
    SELECT debtor_id, creditor_id, SUM(amount) AS total FROM debts
    WHERE group_id = ? AND status = 'active' GROUP BY debtor_id, creditor_id
  `).all(groupId);
  const payments = db.prepare(`
    SELECT payer_id, receiver_id, SUM(amount) AS total FROM payments
    WHERE group_id = ? GROUP BY payer_id, receiver_id
  `).all(groupId);
  const paymentMap = {};
  for (const p of payments) paymentMap[`${p.payer_id}:${p.receiver_id}`] = p.total;
  const results = [];
  for (const d of debts) {
    const paid = paymentMap[`${d.debtor_id}:${d.creditor_id}`] || 0;
    const outstanding = d.total - paid;
    if (outstanding > 0) results.push({ debtor_id: d.debtor_id, creditor_id: d.creditor_id, outstanding });
  }
  return results;
}

module.exports = { ensureGroup, ensureUser, getUser, getOutstandingBalance, getAllOutstandingBalances };
