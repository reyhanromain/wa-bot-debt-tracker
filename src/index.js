const { client } = require('./config');
const qrcode = require('qrcode-terminal');
const { initDatabase } = require('./core/db');
const { loadFeatures } = require('./core/feature-loader');
const { createRouter } = require('./core/router');
const { RateLimiter } = require('./core/rate-limiter');
const { initScheduler } = require('./core/scheduler');
const config = require('./config');
const logger = require('./core/logger');

// Initialize
const db = initDatabase();
const features = loadFeatures(db);
const rateLimiter = new RateLimiter();
const router = createRouter({ db, features, rateLimiter });
initScheduler(db, features, { client });

logger.info(`Features loaded: ${[...features.keys()].join(', ') || '(none)'}`);

// Helper: notify super admin via DM
async function notifyAdmin(text) {
  if (!config.superAdminUserId) return;
  try {
    const admin = db.prepare('SELECT wa_user_id FROM users WHERE id = ?').get(config.superAdminUserId);
    if (admin) await client.sendMessage(admin.wa_user_id, text);
  } catch (_) {}
}

// ─── WhatsApp Client Events ───

client.on('qr', (qr) => {
  console.log('🔷 Scan QR code di bawah ini dengan WhatsApp Anda:');
  logger.info('QR code displayed — waiting for scan');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot siap!');
  logger.info('Bot ready — connected to WhatsApp');
  notifyAdmin('✅ Bot nyala.');
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

client.on('message_create', (msg) => router.handleMessage(msg));

// ─── Graceful Shutdown ───

async function shutdown(signal) {
  console.log(`\n🛑 Menerima ${signal}, mematikan bot...`);
  logger.info(`Shutdown received: ${signal}`);
  try {
    await notifyAdmin('🛑 Bot mati.');
    await new Promise(r => setTimeout(r, 1000));
    await client.destroy();
    logger.info('Bot shut down gracefully');
  } catch (_) {}
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  console.error('❌ Uncaught exception:', err.message);
});

// Start
logger.info('Bot started');
console.log('🚀 Memulai bot...');
client.initialize();
