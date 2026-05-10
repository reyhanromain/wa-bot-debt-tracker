/**
 * .daftar command — Register user with a display name.
 */

const { getUser } = require('../utils/balance');
const { nowWIB } = require('../utils/parser');

/**
 * Handle .daftar <name> command.
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 */
function handleRegister(msg, args, db, sender) {
  const name = args.join(' ').trim();
  if (!name) {
    msg.reply('❌ Gunakan: .daftar <nama>\nContoh: .daftar Reyhan');
    return;
  }

  // sender may be null for unregistered users — derive waUserId from msg
  const waUserId = msg.author || msg.from;
  const ts = nowWIB();
  const existing = getUser(db, waUserId);

  if (existing) {
    // Update existing user
    db.prepare(
      'UPDATE users SET display_name = ?, updated_at = ? WHERE wa_user_id = ?'
    ).run(name, ts, waUserId);
    msg.reply(`👤 Nama berhasil diperbarui menjadi *${name}*`);
  } else {
    // Register new user
    db.prepare(
      'INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).run(waUserId, name, ts, ts);
    msg.reply(`👤 Berhasil mendaftar dengan nama *${name}*`);
  }
}

module.exports = { handleRegister };
