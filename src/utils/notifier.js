/**
 * External notifier — sends alerts and QR images to Telegram so the bot
 * can be recovered remotely when WhatsApp auth dies or the process crashes.
 *
 * Reads NOTIFY_TELEGRAM_TOKEN and NOTIFY_TELEGRAM_CHAT_ID from env. If
 * either is missing, every method becomes a logged no-op so the bot keeps
 * running without notifications.
 */

const config = require('../config');
const logger = require('../core/logger');

const TELEGRAM_API = 'https://api.telegram.org';

function isConfigured() {
  return Boolean(config.notify.telegram.token && config.notify.telegram.chatId);
}

async function sendText(text) {
  if (!isConfigured()) {
    logger.info(`[notifier] (no-op, telegram unconfigured) ${text}`);
    return false;
  }
  const url = `${TELEGRAM_API}/bot${config.notify.telegram.token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.notify.telegram.chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      logger.error(`[notifier] sendText failed: ${res.status} ${await res.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[notifier] sendText error: ${err.message}`);
    return false;
  }
}

async function sendPhoto(pngBuffer, caption) {
  if (!isConfigured()) {
    logger.info(`[notifier] (no-op, telegram unconfigured) photo: ${caption}`);
    return false;
  }
  const url = `${TELEGRAM_API}/bot${config.notify.telegram.token}/sendPhoto`;
  try {
    const form = new FormData();
    form.append('chat_id', config.notify.telegram.chatId);
    if (caption) form.append('caption', caption);
    form.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'qr.png');
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) {
      logger.error(`[notifier] sendPhoto failed: ${res.status} ${await res.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[notifier] sendPhoto error: ${err.message}`);
    return false;
  }
}

async function sendQR(qrString) {
  let qrcode;
  try {
    qrcode = require('qrcode');
  } catch {
    logger.error('[notifier] qrcode package not installed; cannot send QR PNG');
    return sendText('⚠️ Bot perlu di-scan ulang, tapi `qrcode` package belum terpasang. Jalankan `npm install qrcode`.');
  }
  try {
    const png = await qrcode.toBuffer(qrString, { errorCorrectionLevel: 'M', width: 512, margin: 2 });
    return sendPhoto(png, '📱 Scan QR ini dari WhatsApp → Linked Devices → Link a Device. Butuh layar kedua (tablet/HP lain/laptop).');
  } catch (err) {
    logger.error(`[notifier] QR generation failed: ${err.message}`);
    return sendText(`⚠️ Bot perlu di-scan ulang. Generate QR gagal: ${err.message}`);
  }
}

async function alertAuthFailure(reason) {
  return sendText(`⚠️ *WA auth failure*: ${reason || 'unknown'}\nBot akan restart & generate QR baru. QR akan menyusul di chat ini.`);
}

async function alertDisconnect(reason) {
  return sendText(`🔌 *WA disconnected*: ${reason || 'unknown'}\nBot akan restart otomatis.`);
}

async function alertCrash(reason) {
  return sendText(`💥 *Bot crashed*: ${reason}\nsystemd akan respawn.`);
}

async function alertReady() {
  return sendText('✅ Bot WA nyala & terhubung.');
}

async function alertStuck(consecutiveFails, state) {
  return sendText(`🚨 *Bot stuck* — ${consecutiveFails}× cek heartbeat gagal (state: \`${state || 'null'}\`). Exit untuk dipicu systemd restart.`);
}

async function alertJobFailure(jobName, reason) {
  return sendText(`⏰ *Scheduled job gagal* — \`${jobName}\`\n${reason}`);
}

module.exports = {
  isConfigured,
  sendText,
  sendQR,
  alertAuthFailure,
  alertDisconnect,
  alertCrash,
  alertReady,
  alertStuck,
  alertJobFailure,
};
