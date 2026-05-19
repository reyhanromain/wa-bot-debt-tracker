const { formatAmount } = require('../../../shared/parser');

function handleTsx(msg, args, db) {

  const limit = Math.min(parseInt(args[0], 10) || 3, 8);

  // Get last N distinct dates with transactions
  const dates = db.prepare(`
    SELECT DISTINCT date(created_at) AS d FROM yt_transactions ORDER BY d DESC LIMIT ?
  `).all(limit).map(r => r.d).reverse(); // oldest first

  if (dates.length === 0) return msg.reply('📜 Belum ada transaksi.');

  const lines = ['📜 *Transaksi Terakhir*', ''];

  // Context saldo: balance before the first date shown
  const firstDate = dates[0];
  const members = db.prepare('SELECT id, display_name FROM yt_members WHERE active = 1 ORDER BY id').all();
  const contextParts = [];
  for (const m of members) {
    const prev = db.prepare(`
      SELECT balance_after FROM yt_transactions WHERE member_id = ? AND date(created_at) < ? ORDER BY id DESC LIMIT 1
    `).get(m.id, firstDate);
    const bal = prev ? prev.balance_after : 0;
    const sign = bal < 0 ? '-' : '';
    contextParts.push(`  • ${m.display_name}: ${sign}Rp${formatAmount(Math.abs(bal))}`);
  }

  // Format context date as day before first date
  const ctxDate = new Date(firstDate);
  ctxDate.setDate(ctxDate.getDate() - 1);
  const ctxStr = ctxDate.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
  lines.push(`💰 Saldo per ${ctxStr}:`);
  lines.push(contextParts.join('\n'));
  lines.push('');

  // Group transactions by date
  for (const d of dates) {
    const txs = db.prepare(`
      SELECT t.amount, t.balance_after, t.type, m.display_name
      FROM yt_transactions t JOIN yt_members m ON t.member_id = m.id
      WHERE date(t.created_at) = ? ORDER BY t.id
    `).all(d);

    const dateStr = new Date(d + 'T00:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

    // Group by type within same date
    const groups = [];
    let current = null;
    for (const t of txs) {
      const label = t.type === 'deduction' ? 'Billing' : 'Topup';
      if (!current || current.label !== label) {
        current = { label, txs: [] };
        groups.push(current);
      }
      current.txs.push(t);
    }

    for (const g of groups) {
      lines.push(`*${dateStr}* — ${g.label}`);
      for (const t of g.txs) {
        const sign = t.amount > 0 ? '+' : '-';
        const balSign = t.balance_after < 0 ? '-' : '';
        lines.push(`  • ${t.display_name}: ${sign}Rp${formatAmount(Math.abs(t.amount))} → ${balSign}Rp${formatAmount(Math.abs(t.balance_after))}`);
      }
      lines.push('');
    }
  }

  msg.reply(lines.join('\n').trim());
}

module.exports = { handleTsx };
