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
 * Parse a single amount string (not from args).
 * Supports:
 * - Plain integer: 10000
 * - Indonesian thousands dots: 10.000, 1.000.500
 * - Suffix multipliers: 2k, 3rb, 4jt, 5juta, 6m, 7M, 2mil, 3miliar, 1t, 2tr, 3triliun
 * - Decimal comma + suffix: 1,5rb → 1500
 * - Slang Hokkien: goceng, ceban, gocap, cepek, etc.
 * @param {string} raw
 * @returns {number|null}
 */
function parseAmountString(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Slang dictionary (Hokkien-derived)
  const slang = {
    gocap: 50000,
    cepek: 100000,
    nopek: 200,
    gopek: 500,
    seceng: 1000,
    ceceng: 1000,
    noceng: 2000,
    goceng: 5000,
    ceban: 10000,
    goban: 50000,
    cetiao: 1000000,
    cetiau: 1000000,
    gotiao: 5000000,
    gotiau: 5000000,
  };
  if (trimmed in slang) return slang[trimmed];

  // 2. Suffix multipliers (longest first to avoid partial matches)
  const suffixes = [
    ['triliun', 1e12], ['miliar', 1e9], ['juta', 1e6],
    ['tr', 1e12], ['mil', 1e9], ['jt', 1e6],
    ['rb', 1e3],
    ['k', 1e3], ['m', 1e6], ['M', 1e6], ['t', 1e12],
  ];
  for (const [suffix, multiplier] of suffixes) {
    if (trimmed.endsWith(suffix)) {
      let numStr = trimmed.slice(0, -suffix.length);
      if (!numStr) return null;
      numStr = numStr.replace(',', '.');
      const num = parseFloat(numStr);
      if (isNaN(num) || num <= 0) return null;
      return Math.floor(num * multiplier);
    }
  }

  // 3. Plain integer with Indonesian thousands separator dots
  const stripped = trimmed.replace(/\./g, '');
  const num = parseInt(stripped, 10);
  if (isNaN(num) || num <= 0 || String(num) !== stripped) return null;
  return num;
}

/**
 * Extract amount (positive integer) from the args list.
 * @param {string[]} args
 * @returns {{ amount: number|null, rest: string[] }}
 */
function extractAmount(args) {
  if (args.length === 0) return { amount: null, rest: [] };

  const amount = parseAmountString(args[0]);
  if (amount === null) return { amount: null, rest: args };

  return { amount, rest: args.slice(1) };
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
  parseAmountString,
  extractAmount,
  getMentionedId,
  isGroupMessage,
  nowWIB,
  formatDate,
  formatAmount
};
