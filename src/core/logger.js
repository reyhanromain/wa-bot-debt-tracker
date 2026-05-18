/**
 * Simple file logger with daily rotation.
 * Writes to data/logs/YYYY-MM-DD.log AND prints to terminal.
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');

/**
 * Ensure logs directory exists.
 */
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Get today's log file path.
 * @returns {string}
 */
function getTodayLogPath() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOGS_DIR, `${today}.log`);
}

/**
 * Get current timestamp string for log lines (WIB).
 * @returns {string} [DD-MM-YYYY HH:mm:ss]
 */
function getTimestamp() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => parts.find(p => p.type === type)?.value.padStart(2, '0') || '00';
  return `[${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}:${get('second')}]`;
}

/**
 * Write a line to today's log file AND print to terminal.
 * @param {string} level - INFO, CMD, ERROR, BOT
 * @param {string} message
 */
function writeLine(level, message) {
  ensureLogsDir();
  const line = `${getTimestamp()} [${level}] ${message}`;
  fs.appendFileSync(getTodayLogPath(), line + '\n', 'utf8');
  process.stdout.write(line + '\n');
}

/**
 * Log general info.
 * @param {string} message
 */
function info(message) {
  writeLine('INFO', message);
}

/**
 * Log a command execution.
 * @param {object} params
 * @param {string} params.userId - WA user ID
 * @param {string} params.userName - display name
 * @param {string} params.command - command name (without prefix)
 * @param {string} params.args - raw args string
 * @param {string} params.groupId - WA group ID
 * @param {string} params.groupName - group name
 * @param {string} params.status - success | error | rejected | rate_limited
 * @param {string} [params.errorMsg] - error message if status=error
 */
function command({ userId, userName, command, args, groupId, groupName, status, errorMsg }) {
  const argsStr = args || '(none)';
  const errorStr = errorMsg ? ` | ERROR: ${errorMsg}` : '';
  writeLine(
    'CMD',
    `${userId}(${userName}) | .${command} ${argsStr} | group:${groupName}(${groupId}) | status:${status}${errorStr}`
  );
}

/**
 * Log a message sent by the bot.
 * @param {object} params
 * @param {string} params.groupName - group name
 * @param {string} params.groupId - WA group ID
 * @param {string} params.text - message body
 * @param {string} [params.replyTo] - user that was replied to
 */
function botReply({ groupName, groupId, text, replyTo }) {
  const replyStr = replyTo ? ` (reply to ${replyTo})` : '';
  writeLine(
    'BOT',
    `→ group:${groupName}(${groupId})${replyStr} | "${text}"`
  );
}

/**
 * Log an error (not necessarily tied to a command).
 * @param {string} message
 * @param {Error} [err]
 */
function error(message, err) {
  const errStr = err ? ` | ${err.message}` : '';
  writeLine('ERROR', `${message}${errStr}`);
}

module.exports = {
  info,
  command,
  botReply,
  error
};
