const { client } = require('./config');
const qrcode = require('qrcode-terminal');
const { initDatabase } = require('./core/db');
const { loadFeatures } = require('./core/feature-loader');
const { createRouter } = require('./core/router');
const { RateLimiter } = require('./core/rate-limiter');
const { initScheduler } = require('./core/scheduler');
const config = require('./config');
const logger = require('./core/logger');
const notifier = require('./utils/notifier');

const db = initDatabase();
const features = loadFeatures(db);
const rateLimiter = new RateLimiter();
const router = createRouter({ db, features, rateLimiter });
initScheduler(db, features, { client });

logger.info(`Features loaded: ${[...features.keys()].join(', ') || '(none)'}`);

const HEARTBEAT_INTERVAL_MS = 120 * 1000;
const HEARTBEAT_FAIL_THRESHOLD = 3;
let consecutiveFails = 0;
let heartbeatTimer = null;
let isShuttingDown = false;

async function exitForRestart(code, reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.error(`Exiting (${code}): ${reason}`);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try { await client.destroy(); } catch (_) {}
  try { db.close(); } catch (_) {}
  process.exit(code);
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    let state = null;
    try {
      state = await client.getState();
    } catch (err) {
      state = null;
    }
    if (state === 'CONNECTED') {
      if (consecutiveFails > 0) {
        logger.info(`Heartbeat recovered after ${consecutiveFails} fails`);
      }
      consecutiveFails = 0;
      return;
    }
    consecutiveFails += 1;
    logger.warn(`Heartbeat fail ${consecutiveFails}/${HEARTBEAT_FAIL_THRESHOLD} (state=${state})`);
    if (consecutiveFails >= HEARTBEAT_FAIL_THRESHOLD) {
      await notifier.alertStuck(consecutiveFails, state);
      await exitForRestart(1, `heartbeat ${consecutiveFails}× fail (state=${state})`);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

// ─── WhatsApp Client Events ───

client.on('qr', async (qr) => {
  console.log('🔷 Scan QR code di bawah ini dengan WhatsApp Anda:');
  logger.info('QR code displayed — waiting for scan');
  qrcode.generate(qr, { small: true });
  await notifier.sendQR(qr);
});

client.on('ready', () => {
  console.log('✅ Bot siap!');
  logger.info('Bot ready — connected to WhatsApp');
  consecutiveFails = 0;
  startHeartbeat();
  notifier.alertReady();
});

client.on('authenticated', () => {
  console.log('🔑 Autentikasi berhasil.');
  logger.info('Authentication successful');
});

client.on('auth_failure', async (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
  logger.error(`Authentication failed: ${msg}`);
  await notifier.alertAuthFailure(msg);
  await exitForRestart(1, `auth_failure: ${msg}`);
});

client.on('disconnected', async (reason) => {
  console.log('🔌 Bot terputus:', reason);
  logger.error(`Disconnected: ${reason}`);
  await notifier.alertDisconnect(reason);
  await exitForRestart(1, `disconnected: ${reason}`);
});

client.on('message_create', (msg) => {
  Promise.resolve()
    .then(() => router.handleMessage(msg))
    .catch((err) => logger.error(`Message handler error: ${err.stack || err.message}`));
});

// ─── Graceful Shutdown ───

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Menerima ${signal}, mematikan bot...`);
  logger.info(`Shutdown received: ${signal}`);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try {
    await client.destroy();
    logger.info('Bot shut down gracefully');
  } catch (_) {}
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', async (err) => {
  console.error('❌ Uncaught exception:', err.message);
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
  await notifier.alertCrash(`uncaughtException: ${err.message}`).catch(() => {});
  await exitForRestart(1, 'uncaughtException');
});

process.on('unhandledRejection', async (err) => {
  const msg = err && err.stack ? err.stack : String(err);
  console.error('❌ Unhandled rejection:', msg);
  logger.error(`Unhandled rejection: ${msg}`);
  await notifier.alertCrash(`unhandledRejection: ${err && err.message ? err.message : String(err)}`).catch(() => {});
  await exitForRestart(1, 'unhandledRejection');
});

logger.info('Bot started');
console.log('🚀 Memulai bot...');
client.initialize();
