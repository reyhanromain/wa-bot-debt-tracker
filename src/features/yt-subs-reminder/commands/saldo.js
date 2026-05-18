const config = require('../../../config');
const { formatAmount } = require('../../../shared/parser');

function handleSaldo(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  const members = db.prepare('SELECT display_name, balance FROM yt_members WHERE active = 1 ORDER BY id').all();
  const lines = ['💰 *Saldo YouTube Premium*', ''];
  for (const m of members) {
    const sign = m.balance < 0 ? '-' : '';
    lines.push(`• ${m.display_name}: ${sign}Rp${formatAmount(Math.abs(m.balance))}`);
  }

  // Next billing date
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), 14);
  if (now.getDate() >= 14) next.setMonth(next.getMonth() + 1);
  const nextStr = next.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

  lines.push('');
  lines.push(`📅 Billing berikutnya: ${nextStr}`);
  lines.push('💸 Per member: Rp31.000/bulan');

  msg.reply(lines.join('\n'));
}

module.exports = { handleSaldo };
