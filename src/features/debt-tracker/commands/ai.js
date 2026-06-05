const { isReady, askAI } = require('../../../utils/ai');
const { tools, executeTool, SYSTEM_PROMPT } = require('../ai-tools');

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

  const mentionedUsers = [];
  if (msg.mentions && msg.mentions.length > 0) {
    for (const mention of msg.mentions) {
      const user = db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?')
        .get(mention.id || mention);
      if (user) mentionedUsers.push(user);
    }
  }

  const hints = [];
  if (sender && sender.display_name) hints.push(`(Pertanyaan dari: ${sender.display_name})`);
  if (mentionedUsers.length > 0) {
    hints.push(`(User yang di-mention: ${mentionedUsers.map(u => u.display_name).join(', ')})`);
  }
  const userMessage = hints.length > 0 ? `${hints.join('\n')}\n${prompt}` : prompt;

  try {
    const answer = await askAI({
      prompt: userMessage,
      systemPrompt: SYSTEM_PROMPT,
      tools,
      executeTool,
      toolContext: { db, groupId, waGroupId },
    });
    if (!answer) {
      msg.reply('❌ AI tidak menghasilkan respons.');
      return;
    }
    msg.reply(`💭 ${answer}`);
  } catch (err) {
    msg.reply(`❌ ${err.message}`);
  }
}

module.exports = { handleAi };
