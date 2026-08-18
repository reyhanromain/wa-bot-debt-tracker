const config = require('../../../config');
const { getMentionedId, extractAmount, parseAmountString, nowWIB, formatAmount } = require('../../../shared/parser');

function resolveTopupTarget(msg, args, db) {
  const mentionedId = getMentionedId(msg);
  if (mentionedId) {
    const member = db.prepare('SELECT id, display_name, balance FROM yt_members WHERE wa_user_id = ? AND active = 1').get(mentionedId);
    return {
      member,
      amountArgs: args.filter(a => !a.startsWith('@')),
      missingMessage: '❌ Member tidak ditemukan. Pastikan sudah di-link via .member edit-user',
    };
  }

  const amountIndex = args.reduce((lastIndex, arg, index) => (
    parseAmountString(arg) !== null ? index : lastIndex
  ), -1);
  if (amountIndex <= 0) {
    return { member: null, amountArgs: [], missingMessage: '❌ .topup @user|<nama> <nominal>' };
  }

  const name = args.slice(0, amountIndex).join(' ').trim();
  const member = db.prepare('SELECT id, display_name, balance FROM yt_members WHERE LOWER(display_name) = LOWER(?) AND active = 1').get(name);
  return {
    member,
    amountArgs: args.slice(amountIndex),
    missingMessage: `❌ Member "${name}" tidak ditemukan.`,
  };
}

function handleTopup(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  const { member, amountArgs, missingMessage } = resolveTopupTarget(msg, args, db);
  if (!member) return msg.reply(missingMessage);

  const { amount } = extractAmount(amountArgs);
  if (!amount) return msg.reply('❌ .topup @user|<nama> <nominal>\nContoh: .topup @user 62000 atau .topup reyhan 62000');

  const newBalance = member.balance + amount;
  const ts = nowWIB();
  db.prepare('UPDATE yt_members SET balance = ? WHERE id = ?').run(newBalance, member.id);
  db.prepare('INSERT INTO yt_transactions (member_id, type, amount, balance_after, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(member.id, 'topup', amount, newBalance, 'topup', ts);

  msg.reply(`✅ Topup *${member.display_name}*: +Rp${formatAmount(amount)} → Rp${formatAmount(newBalance)}`);
}

module.exports = { handleTopup, resolveTopupTarget };
