const { client } = require('./config');
const qrcode = require('qrcode-terminal');
const { initDatabase } = require('./database');
const { getCommand } = require('./commands');
const { RateLimiter } = require('./utils/rate-limiter');
const { parseCommand, isGroupMessage } = require('./utils/parser');
const { ensureGroup, getUser } = require('./utils/balance');
const config = require('./config');
const logger = require('./utils/logger');

// Initialize in-memory rate limiter
const rateLimiter = new RateLimiter();

// Initialize database
const db = initDatabase();

// ─── WhatsApp Client Events ───

client.on('qr', (qr) => {
  console.log('🔷 Scan QR code di bawah ini dengan WhatsApp Anda:');
  logger.info('QR code displayed — waiting for scan');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot siap!');
  logger.info('Bot ready — connected to WhatsApp');
});

client.on('authenticated', () => {
  console.log('🔑 Autentikasi berhasil.');
  logger.info('Authentication successful');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
  logger.error('Authentication failed', msg);
});

client.on('disconnected', (reason) => {
  console.log('🔌 Bot terputus:', reason);
  logger.info(`Disconnected: ${reason}`);
});

client.on('message_create', async (msg) => {
  // Log bot's own outgoing messages (replies)
  if (msg.fromMe) {
    // Only log messages sent to groups
    if (msg.to && msg.to.endsWith('@g.us')) {
      let groupName = msg.to;
      try {
        const chat = await msg.getChat();
        if (chat && chat.name) groupName = chat.name;
      } catch (_) {}
      logger.botReply({
        groupId: msg.to,
        groupName,
        text: msg.body
      });
    }
    return;
  }

  // Only handle group messages
  if (!isGroupMessage(msg)) return;

  const { command, args, rawArgs } = parseCommand(msg.body);
  if (!command) return;

  const cmdMeta = getCommand(command);
  if (!cmdMeta) return; // Unknown command, silently ignore

  const waUserId = msg.author || msg.from;
  const waGroupId = msg.from;

  // Ensure group exists in DB (handle async getChat)
  let groupName = waGroupId;
  try {
    const chat = await msg.getChat();
    if (chat && chat.name) groupName = chat.name;
  } catch (_) {
    // Silently fall back to group ID
  }

  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, '+07:00');
  const groupId = ensureGroup(db, waGroupId, groupName, ts);

  // Get user info (may be null if unregistered)
  const sender = getUser(db, waUserId);
  const isRegistered = sender !== null;
  const userName = sender ? sender.display_name : waUserId.split('@')[0];

  // ─── Public commands: rate limited ───

  if (cmdMeta.isPublic) {
    const rateKey = `${waUserId}:${waGroupId}:${command}`;
    const allowed = rateLimiter.allow(rateKey, cmdMeta.rateLimit.max, cmdMeta.rateLimit.windowMs);

    if (!allowed) {
      logger.command({
        userId: waUserId, userName, command, args: rawArgs,
        groupId: waGroupId, groupName, status: 'rate_limited'
      });
      return; // Silent ignore
    }

    try {
      await cmdMeta.handler(msg, args, db, sender, groupId);
      logger.command({
        userId: waUserId, userName, command, args: rawArgs,
        groupId: waGroupId, groupName, status: 'success'
      });
    } catch (err) {
      logger.command({
        userId: waUserId, userName, command, args: rawArgs,
        groupId: waGroupId, groupName, status: 'error', errorMsg: err.message
      });
    }
    return;
  }

  // ─── Non-public commands: check registration (if required) ───

  if (cmdMeta.requiresRegistration && !isRegistered) {
    const rejectKey = `${waUserId}:${waGroupId}:reject`;
    const allowed = rateLimiter.allow(rejectKey, config.rateLimits.unregisteredRejection.max, config.rateLimits.unregisteredRejection.windowMs);

    if (allowed) {
      msg.reply('❌ Silakan daftar dulu dengan .daftar <nama>');
      logger.command({
        userId: waUserId, userName, command, args: rawArgs,
        groupId: waGroupId, groupName, status: 'rejected'
      });
    } else {
      logger.command({
        userId: waUserId, userName, command, args: rawArgs,
        groupId: waGroupId, groupName, status: 'rate_limited'
      });
    }
    return;
  }

  // ─── Execute Core Command ───

  try {
    await cmdMeta.handler(msg, args, db, sender, groupId);
    logger.command({
      userId: waUserId, userName, command, args: rawArgs,
      groupId: waGroupId, groupName, status: 'success'
    });
  } catch (err) {
    console.error(`Error handling .${command}:`, err);
    logger.command({
      userId: waUserId, userName, command, args: rawArgs,
      groupId: waGroupId, groupName, status: 'error', errorMsg: err.message
    });
  }
});

// ─── Graceful Shutdown ───

async function shutdown(signal) {
  console.log(`\n🛑 Menerima ${signal}, mematikan bot...`);
  logger.info(`Shutdown received: ${signal}`);
  try {
    await client.destroy();
    logger.info('Bot shut down gracefully');
  } catch (_) {
    // Ignore destroy errors
  }
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Also handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  console.error('❌ Uncaught exception:', err.message);
});

// Start the bot
logger.info('Bot started');
console.log('🚀 Memulai bot...');
client.initialize();
