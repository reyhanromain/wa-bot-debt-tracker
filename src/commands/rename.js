/**
 * .rename command — Change user's display name.
 */

const { nowWIB } = require('../utils/parser');

/**
 * Handle .rename <new_name> command.
 * @param {object} msg - whatsapp-web.js message object
 * @param {string[]} args
 * @param {import('better-sqlite3').Database} db
 * @param {object} sender - User record { id, wa_user_id, display_name }
 */
function handleRename(msg, args, db, sender) {
  const newName = args.join(' ').trim();
  if (!newName) {
    msg.reply('❌ Gunakan: .rename <nama>\nContoh: .rename Budi');
    return;
  }

  const ts = nowWIB();
  db.prepare(
    'UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?'
  ).run(newName, ts, sender.id);

  msg.reply(`👤 Nama berhasil diubah menjadi *${newName}*`);
}

module.exports = { handleRename };
