const { isReady, askAI } = require('../utils/ai');
const config = require('../config');

async function handleAi(msg, args, db, sender, groupId) {
  if (!isReady()) {
    msg.reply('❌ Fitur AI tidak dikonfigurasi dengan benar. Hubungi admin.');
    return;
  }

  const prompt = args.join(' ').trim();
  if (!prompt) {
    msg.reply('❌ Gunakan: .ai <prompt>\nContoh: .ai berapa total utang saya?');
    return;
  }

  const waGroupId = msg.from;
  const maxRows = config.ai.contextMaxRows || null;
  const limitClause = maxRows ? `LIMIT ${maxRows}` : '';

  // Gather context data
  const group = db.prepare('SELECT wa_group_id, name FROM groups WHERE wa_group_id = ?').get(waGroupId);
  const users = db.prepare('SELECT wa_user_id, display_name FROM users').all();

  const debts = db.prepare(`
    SELECT d.amount, d.description, d.status, d.created_at,
           u1.display_name AS debtor_name, u2.display_name AS creditor_name
    FROM debts d
    JOIN users u1 ON d.debtor_id = u1.id
    JOIN users u2 ON d.creditor_id = u2.id
    WHERE d.group_id = ? ${maxRows ? 'ORDER BY d.created_at DESC' : ''} ${limitClause}
  `).all(groupId);

  const payments = db.prepare(`
    SELECT p.amount, p.description, p.created_at,
           u1.display_name AS payer_name, u2.display_name AS receiver_name
    FROM payments p
    JOIN users u1 ON p.payer_id = u1.id
    JOIN users u2 ON p.receiver_id = u2.id
    WHERE p.group_id = ? ${maxRows ? 'ORDER BY p.created_at DESC' : ''} ${limitClause}
  `).all(groupId);

  const logs = db.prepare(`
    SELECT user_name, command, args, status, created_at
    FROM command_log
    WHERE group_id = ?
    ORDER BY created_at DESC
    ${limitClause}
  `).all(waGroupId);

  // Resolve mentioned users
  const mentionedUsers = [];
  if (msg.mentions && msg.mentions.length > 0) {
    for (const mention of msg.mentions) {
      const user = db.prepare('SELECT wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(mention.id || mention);
      if (user) mentionedUsers.push(user);
    }
  }

  const contextData = {
    group: group || null,
    users,
    debts_summary: debts,
    payments_summary: payments,
    recent_logs: logs,
    mentioned_users: mentionedUsers,
  };

  try {
    const answer = await askAI(prompt, contextData);
    msg.reply(`🤖 *AI:* ${answer}`);
  } catch (err) {
    msg.reply(`❌ ${err.message}`);
  }
}

module.exports = { handleAi };
