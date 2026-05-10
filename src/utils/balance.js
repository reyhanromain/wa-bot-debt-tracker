/**
 * Balance and history query utilities.
 */

/**
 * Get or create a group record.
 * @param {import('better-sqlite3').Database} db
 * @param {string} waGroupId
 * @param {string} groupName
 * @param {string} timestamp
 * @returns {number} group.id
 */
function ensureGroup(db, waGroupId, groupName, timestamp) {
  const existing = db.prepare('SELECT id FROM groups WHERE wa_group_id = ?').get(waGroupId);
  if (existing) return existing.id;

  const info = db.prepare(
    'INSERT INTO groups (wa_group_id, name, created_at) VALUES (?, ?, ?)'
  ).run(waGroupId, groupName, timestamp);
  return info.lastInsertRowid;
}

/**
 * Get or create a user record by WhatsApp user ID.
 * If the user doesn't exist, auto-register with their WhatsApp name or phone number.
 * @param {import('better-sqlite3').Database} db
 * @param {string} waUserId
 * @param {string} defaultName - Fallback display name (e.g. phone number)
 * @param {string} timestamp
 * @returns {{ id: number, wa_user_id: string, display_name: string } | null}
 */
function ensureUser(db, waUserId, defaultName, timestamp) {
  const existing = db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId);
  if (existing) return existing;

  db.prepare(
    'INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(waUserId, defaultName, timestamp, timestamp);

  return db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId);
}

/**
 * Get a user by their WhatsApp user ID. Returns null if not found.
 * @param {import('better-sqlite3').Database} db
 * @param {string} waUserId
 * @returns {object|null}
 */
function getUser(db, waUserId) {
  return db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId) || null;
}

/**
 * Calculate outstanding balance for a (group, debtor, creditor) pair.
 * @param {import('better-sqlite3').Database} db
 * @param {number} groupId
 * @param {number} debtorId
 * @param {number} creditorId
 * @returns {number} - Outstanding balance (0 or positive)
 */
function getOutstandingBalance(db, groupId, debtorId, creditorId) {
  const totalDebt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM debts
    WHERE group_id = ? AND debtor_id = ? AND creditor_id = ? AND status = 'active'
  `).get(groupId, debtorId, creditorId);

  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE group_id = ? AND payer_id = ? AND receiver_id = ?
  `).get(groupId, debtorId, creditorId);

  const balance = totalDebt.total - totalPaid.total;
  return balance > 0 ? balance : 0;
}

/**
 * Get all (debtor_id, creditor_id) pairs with positive outstanding in a group.
 * @param {import('better-sqlite3').Database} db
 * @param {number} groupId
 * @returns {Array<{ debtor_id: number, creditor_id: number, outstanding: number }>}
 */
function getAllOutstandingBalances(db, groupId) {
  const debts = db.prepare(`
    SELECT debtor_id, creditor_id, SUM(amount) AS total
    FROM debts
    WHERE group_id = ? AND status = 'active'
    GROUP BY debtor_id, creditor_id
  `).all(groupId);

  const payments = db.prepare(`
    SELECT payer_id, receiver_id, SUM(amount) AS total
    FROM payments
    WHERE group_id = ?
    GROUP BY payer_id, receiver_id
  `).all(groupId);

  // Build payment map: "payer_id:receiver_id" -> total
  const paymentMap = {};
  for (const p of payments) {
    paymentMap[`${p.payer_id}:${p.receiver_id}`] = p.total;
  }

  const results = [];
  for (const d of debts) {
    const key = `${d.debtor_id}:${d.creditor_id}`;
    const paid = paymentMap[key] || 0;
    const outstanding = d.total - paid;
    if (outstanding > 0) {
      results.push({ debtor_id: d.debtor_id, creditor_id: d.creditor_id, outstanding });
    }
  }

  return results;
}

/**
 * Check if a user has any involvement (as debtor or creditor) in a group.
 * @param {import('better-sqlite3').Database} db
 * @param {number} groupId
 * @param {number} userId
 * @returns {boolean}
 */
function hasInvolvement(db, groupId, userId) {
  const debtCount = db.prepare(`
    SELECT COUNT(*) AS count FROM debts
    WHERE group_id = ? AND (debtor_id = ? OR creditor_id = ?) AND status = 'active'
  `).get(groupId, userId, userId);

  const payCount = db.prepare(`
    SELECT COUNT(*) AS count FROM payments
    WHERE group_id = ? AND (payer_id = ? OR receiver_id = ?)
  `).get(groupId, userId, userId);

  return debtCount.count > 0 || payCount.count > 0;
}

/**
 * Get the 3 latest transactions for a specific user in a group.
 * Returns combined debts (active) + payments, newest first.
 * @param {import('better-sqlite3').Database} db
 * @param {number} groupId
 * @param {number} userId
 * @param {number} [limit=3]
 * @returns {Array<{ type: string, other_id: number, amount: number, description: string|null, created_at: string, is_debtor: boolean }>}
 */
function getLatestTransactions(db, groupId, userId, limit = 3) {
  const rows = db.prepare(`
    SELECT 'debt' AS type, debtor_id AS user_id, creditor_id AS other_id,
           amount, description, created_at
    FROM debts
    WHERE group_id = ? AND (debtor_id = ? OR creditor_id = ?) AND status = 'active'
    UNION ALL
    SELECT 'payment' AS type, payer_id AS user_id, receiver_id AS other_id,
           amount, description, created_at
    FROM payments
    WHERE group_id = ? AND (payer_id = ? OR receiver_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(groupId, userId, userId, groupId, userId, userId, limit);

  // Add is_debtor flag: for debts, check if userId is the debtor; for payments, check if userId is the payer
  return rows.map(r => ({
    ...r,
    is_debtor: r.type === 'debt' ? r.user_id === userId : r.user_id === userId
  }));
}

module.exports = {
  ensureGroup,
  ensureUser,
  getUser,
  getOutstandingBalance,
  getAllOutstandingBalances,
  hasInvolvement,
  getLatestTransactions
};
