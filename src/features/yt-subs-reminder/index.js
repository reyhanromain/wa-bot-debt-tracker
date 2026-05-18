const { initSchema } = require('./schema');
const { handleMember } = require('./commands/member');
const { handleTopup } = require('./commands/topup');
const { handleSaldo } = require('./commands/saldo');
const { handleTsx } = require('./commands/tsx');
const { handleHelp } = require('./commands/help');
const { formatAmount } = require('../../shared/parser');

const MONTHLY_FEE = 31000;

module.exports = {
  name: 'yt-subs-reminder',
  description: 'Pengingat tagihan YouTube Premium Family',
  initSchema,
  commands: {
    member: { handler: handleMember, requiresRegistration: false, rateLimit: null, help: '.member — Manage member' },
    topup: { handler: handleTopup, requiresRegistration: false, rateLimit: null, help: '.topup @user <nominal> — Tambah saldo' },
    saldo: { handler: handleSaldo, requiresRegistration: false, rateLimit: null, help: '.saldo — Lihat saldo' },
    tsx: { handler: handleTsx, requiresRegistration: false, rateLimit: null, help: '.tsx [n] — Riwayat transaksi' },
    help: { handler: handleHelp, requiresRegistration: false, rateLimit: null, help: '.help — Bantuan' },
  },
  schedules: [
    {
      name: 'yt-billing',
      cron: '0 9 14 * *',
      tz: 'Asia/Jakarta',
      async run({ db, client }) {
        const members = db.prepare('SELECT * FROM yt_members WHERE active = 1 ORDER BY id').all();
        const now = new Date();
        const ts = now.toISOString().replace(/\.\d{3}Z$/, '+07:00');
        const monthStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

        const lines = [`📢 *YouTube Premium — Billing ${monthStr}*`, '', `Saldo dikurangi Rp${formatAmount(MONTHLY_FEE)} per member.`, '', '💰 *Saldo setelah billing:*'];
        const warnings = [];

        const deduct = db.transaction(() => {
          for (const m of members) {
            const newBalance = m.balance - MONTHLY_FEE;
            db.prepare('UPDATE yt_members SET balance = ? WHERE id = ?').run(newBalance, m.id);
            db.prepare('INSERT INTO yt_transactions (member_id, type, amount, balance_after, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, 'deduction', -MONTHLY_FEE, newBalance, 'billing', ts);

            const sign = newBalance < 0 ? '-' : '';
            const warn = newBalance < 0 ? ' ⚠️' : '';
            lines.push(`• ${m.display_name}: ${sign}Rp${formatAmount(Math.abs(newBalance))}${warn}`);
            if (newBalance < 0 && m.wa_user_id) warnings.push(m);
          }
        });

        deduct();

        if (warnings.length > 0) {
          lines.push('');
          for (const m of warnings) {
            lines.push(`⚠️ @${m.wa_user_id.split('@')[0]} (${m.display_name}) saldo minus! Mohon segera top-up.`);
          }
        }

        // Send to all groups that have this feature assigned
        const groups = db.prepare("SELECT wa_group_id FROM group_features WHERE feature_name = 'yt-subs-reminder'").all();
        for (const g of groups) {
          try {
            const chat = await client.getChatById(g.wa_group_id);
            if (warnings.length > 0) {
              await chat.sendMessage(lines.join('\n'), { mentions: warnings.map(m => m.wa_user_id) });
            } else {
              await chat.sendMessage(lines.join('\n'));
            }
          } catch (_) {}
        }
      },
    },
  ],
};
