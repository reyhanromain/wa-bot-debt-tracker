const config = require('../../../config');
const { formatAmount, nowWIB } = require('../../../shared/parser');

const MONTHLY_FEE = 31000;

function handleBilling(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  // Check if billing already done this month
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const exists = db.prepare(`SELECT id FROM yt_transactions WHERE type = 'deduction' AND description = 'billing' AND created_at LIKE ?`).get(`${yearMonth}%`);
  if (exists) return msg.reply(`⏭️ Billing bulan ini sudah dilakukan.`);

  const members = db.prepare('SELECT * FROM yt_members WHERE active = 1 ORDER BY id').all();
  const ts = nowWIB();
  const monthStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' });

  const lines = [`📢 *YouTube Premium — Billing ${monthStr}*`, '', `Saldo dikurangi Rp${formatAmount(MONTHLY_FEE)} per member.`, '', '💰 *Saldo setelah billing:*'];
  const warnings = [];

  db.transaction(() => {
    for (const m of members) {
      const newBalance = m.balance - MONTHLY_FEE;
      db.prepare('UPDATE yt_members SET balance = ? WHERE id = ?').run(newBalance, m.id);
      db.prepare('INSERT INTO yt_transactions (member_id, type, amount, balance_after, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, 'deduction', -MONTHLY_FEE, newBalance, 'billing', ts);
      const sign = newBalance < 0 ? '-' : '';
      const warn = newBalance < 0 ? ' ⚠️' : '';
      lines.push(`• ${m.display_name}: ${sign}Rp${formatAmount(Math.abs(newBalance))}${warn}`);
      if (newBalance < 0 && m.wa_user_id) warnings.push(m);
    }
  })();

  if (warnings.length > 0) {
    lines.push('');
    for (const m of warnings) {
      lines.push(`⚠️ @${m.wa_user_id.split('@')[0]} (${m.display_name}) saldo minus! Mohon segera top-up.`);
    }
  }

  msg.reply(lines.join('\n'));
}

module.exports = { handleBilling };
