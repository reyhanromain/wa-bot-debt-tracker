const config = require('../../../config');
const { getMentionedId, extractAmount, nowWIB, formatAmount } = require('../../../shared/parser');

function handleTopup(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  const mentionedId = getMentionedId(msg);
  if (!mentionedId) return msg.reply('❌ .topup @user <nominal>');

  const member = db.prepare('SELECT id, display_name, balance FROM yt_members WHERE wa_user_id = ? AND active = 1').get(mentionedId);
  if (!member) return msg.reply('❌ Member tidak ditemukan. Pastikan sudah di-link via .member edit-user');

  const cleanArgs = args.filter(a => !a.startsWith('@'));
  const { amount } = extractAmount(cleanArgs);
  if (!amount) return msg.reply('❌ .topup @user <nominal>\nContoh: .topup @user 62000');

  const newBalance = member.balance + amount;
  const ts = nowWIB();
  db.prepare('UPDATE yt_members SET balance = ? WHERE id = ?').run(newBalance, member.id);
  db.prepare('INSERT INTO yt_transactions (member_id, type, amount, balance_after, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(member.id, 'topup', amount, newBalance, 'topup', ts);

  msg.reply(`✅ Topup *${member.display_name}*: +Rp${formatAmount(amount)} → Rp${formatAmount(newBalance)}`);
}

module.exports = { handleTopup };
