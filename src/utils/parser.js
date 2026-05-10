const config = require('../config');

/**
 * Parse a raw message body into command and arguments.
 * @param {string} body - Raw message text (e.g. ".utang @user 10000 donat")
 * @returns {{ command: string|null, args: string[], rawArgs: string }}
 */
function parseCommand(body) {
  if (!body || !body.startsWith(config.commandPrefix)) {
    return { command: null, args: [], rawArgs: '' };
  }

  const trimmed = body.slice(config.commandPrefix.length).trim();
  if (!trimmed) {
    return { command: null, args: [], rawArgs: '' };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args, rawArgs: trimmed.slice(command.length).trim() };
}

/**
 * Extract amount (positive integer) from the args list.
 * @param {string[]} args
 * @returns {{ amount: number|null, rest: string[] }}
 */
function extractAmount(args) {
  if (args.length === 0) return { amount: null, rest: [] };

  const num = parseInt(args[0], 10);
  if (isNaN(num) || num <= 0 || String(num) !== args[0]) {
    return { amount: null, rest: args };
  }

  return { amount: num, rest: args.slice(1) };
}

/**
 * Get the mentioned WhatsApp user ID from a message.
 * @param {object} msg - whatsapp-web.js message object
 * @returns {string|null} - Serialized WhatsApp user ID or null
 */
function getMentionedId(msg) {
  if (msg.mentionedIds && msg.mentionedIds.length > 0) {
    return msg.mentionedIds[0];
  }
  return null;
}

/**
 * Check if the message is from a group.
 * @param {object} msg - whatsapp-web.js message object
 * @returns {boolean}
 */
function isGroupMessage(msg) {
  return msg.from.endsWith('@g.us');
}

/**
 * Get the current timestamp in ISO 8601 format with WIB offset (UTC+7).
 * @returns {string}
 */
function nowWIB() {
  const now = new Date();
  // sv-SE locale formats as YYYY-MM-DD HH:mm:ss
  const dateStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${dateStr.replace(' ', 'T')}.${ms}+07:00`;
}

/**
 * Format a timestamp string for WhatsApp display.
 * "2026-05-10T13:00:00.000+07:00" → "10 Mei 13:00"
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format amount for display (e.g. 10000 → "10.000").
 * @param {number} amount
 * @returns {string}
 */
function formatAmount(amount) {
  return amount.toLocaleString('id-ID');
}

module.exports = {
  parseCommand,
  extractAmount,
  getMentionedId,
  isGroupMessage,
  nowWIB,
  formatDate,
  formatAmount
};
