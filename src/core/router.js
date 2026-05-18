const { parseCommand, isGroupMessage, nowWIB } = require('../shared/parser');
const { handleAssist } = require('../commands/assist');
const config = require('../config');
const logger = require('./logger');

function randomDelay() {
  return 2000 + Math.random() * 3000; // 2-5 seconds
}

async function simulateTyping(msg) {
  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
    await new Promise(r => setTimeout(r, randomDelay()));
    await chat.clearState();
  } catch (_) {}
}

function createRouter({ db, features, rateLimiter }) {

  function ensureGroup(waGroupId, groupName) {
    const existing = db.prepare('SELECT id FROM groups WHERE wa_group_id = ?').get(waGroupId);
    if (existing) return existing.id;
    const ts = nowWIB();
    const info = db.prepare('INSERT INTO groups (wa_group_id, name, created_at) VALUES (?, ?, ?)').run(waGroupId, groupName, ts);
    return info.lastInsertRowid;
  }

  function logCommand({ userId, userName, command, args, groupId, groupName, status, errorMsg }) {
    const ts = nowWIB();
    db.prepare(`
      INSERT INTO command_log (user_id, user_name, command, args, group_id, group_name, status, error_msg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userName, command, args || null, groupId, groupName, status, errorMsg || null, ts);
  }

  async function handleMessage(msg) {
    if (msg.fromMe) {
      if (msg.to && msg.to.endsWith('@g.us')) {
        let groupName = msg.to;
        try { const chat = await msg.getChat(); if (chat && chat.name) groupName = chat.name; } catch (_) {}
        logger.botReply({ groupId: msg.to, groupName, text: msg.body });
      }
      return;
    }

    if (!isGroupMessage(msg)) return;

    const { command, args, rawArgs } = parseCommand(msg.body);
    if (!command) return;

    const waUserId = msg.author || msg.from;
    const waGroupId = msg.from;

    // Get group name (async)
    let groupName = waGroupId;
    try { const chat = await msg.getChat(); if (chat && chat.name) groupName = chat.name; } catch (_) {}

    // Global command: .assist
    if (command === 'assist') {
      await simulateTyping(msg);
      handleAssist(msg, args, db, features);
      logger.command({ userId: waUserId, userName: waUserId.split('@')[0], command, args: rawArgs, groupId: waGroupId, groupName, status: 'success' });
      return;
    }

    // Feature gate: lookup group_features
    const binding = db.prepare('SELECT feature_name FROM group_features WHERE wa_group_id = ?').get(waGroupId);
    if (!binding) return; // silent ignore

    const feature = features.get(binding.feature_name);
    if (!feature) return; // feature not loaded (shouldn't happen)

    const cmdMeta = feature.commands[command];
    if (!cmdMeta) return; // command not in this feature, silent ignore

    // Ensure group in DB
    const groupId = ensureGroup(waGroupId, groupName);

    // Get sender
    const sender = db.prepare('SELECT id, wa_user_id, display_name FROM users WHERE wa_user_id = ?').get(waUserId) || null;
    const userName = sender ? sender.display_name : waUserId.split('@')[0];

    // Rate limit check (if command has rateLimit)
    if (cmdMeta.rateLimit) {
      const rateKey = `${waUserId}:${waGroupId}:${command}`;
      if (!rateLimiter.allow(rateKey, cmdMeta.rateLimit.max, cmdMeta.rateLimit.windowMs)) {
        logger.command({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'rate_limited' });
        logCommand({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'rate_limited' });
        return;
      }
    }

    // Registration check
    if (cmdMeta.requiresRegistration && !sender) {
      const rejectKey = `${waUserId}:${waGroupId}:reject`;
      if (rateLimiter.allow(rejectKey, 1, 60000)) {
        await simulateTyping(msg);
        msg.reply('❌ Silakan daftar dulu dengan .daftar <nama>');
        logger.command({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'rejected' });
        logCommand({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'rejected' });
      }
      return;
    }

    // Execute command
    try {
      await simulateTyping(msg);
      await cmdMeta.handler(msg, args, db, sender, groupId);
      logger.command({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'success' });
      logCommand({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'success' });
    } catch (err) {
      console.error(`Error handling .${command}:`, err);
      logger.command({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'error', errorMsg: err.message });
      logCommand({ userId: waUserId, userName, command, args: rawArgs, groupId: waGroupId, groupName, status: 'error', errorMsg: err.message });
    }
  }

  return { handleMessage };
}

module.exports = { createRouter };
