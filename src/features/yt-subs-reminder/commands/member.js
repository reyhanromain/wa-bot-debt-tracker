const config = require('../../../config');
const { getMentionedId, nowWIB } = require('../../../shared/parser');

function handleMember(msg, args, db) {
  const waUserId = msg.author || msg.from;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  const sub = (args[0] || '').toLowerCase();

  if (sub === 'new') {
    const mentionedId = getMentionedId(msg);
    if (!mentionedId) return msg.reply('❌ .member new @user <nama>');
    const name = args.filter(a => !a.startsWith('@')).slice(1).join(' ').trim();
    if (!name) return msg.reply('❌ .member new @user <nama>');
    const exists = db.prepare('SELECT id FROM yt_members WHERE display_name = ?').get(name);
    if (exists) return msg.reply(`❌ Member "${name}" sudah ada.`);
    const ts = nowWIB();
    db.prepare('INSERT INTO yt_members (display_name, wa_user_id, balance, active, created_at) VALUES (?, ?, 0, 1, ?)').run(name, mentionedId, ts);
    msg.reply(`✅ Member *${name}* ditambahkan.`);
  } else if (sub === 'edit-name') {
    const oldName = args[1];
    const newName = args.slice(2).join(' ').trim();
    if (!oldName || !newName) return msg.reply('❌ .member edit-name <nama_lama> <nama_baru>');
    const member = db.prepare('SELECT id FROM yt_members WHERE display_name = ?').get(oldName);
    if (!member) return msg.reply(`❌ Member "${oldName}" tidak ditemukan.`);
    db.prepare('UPDATE yt_members SET display_name = ? WHERE id = ?').run(newName, member.id);
    msg.reply(`✅ Nama diubah: ${oldName} → *${newName}*`);
  } else if (sub === 'edit-user') {
    const name = args[1];
    const mentionedId = getMentionedId(msg);
    if (!name || !mentionedId) return msg.reply('❌ .member edit-user <nama> @user');
    const member = db.prepare('SELECT id FROM yt_members WHERE display_name = ?').get(name);
    if (!member) return msg.reply(`❌ Member "${name}" tidak ditemukan.`);
    db.prepare('UPDATE yt_members SET wa_user_id = ? WHERE id = ?').run(mentionedId, member.id);
    msg.reply(`✅ Member *${name}* di-link ke @${mentionedId.split('@')[0]}`);
  } else if (sub === 'remove') {
    const mentionedId = getMentionedId(msg);
    if (!mentionedId) return msg.reply('❌ .member remove @user');
    const member = db.prepare('SELECT id, display_name FROM yt_members WHERE wa_user_id = ?').get(mentionedId);
    if (!member) return msg.reply('❌ Member tidak ditemukan.');
    db.prepare('UPDATE yt_members SET active = 0 WHERE id = ?').run(member.id);
    msg.reply(`✅ Member *${member.display_name}* dihapus.`);
  } else {
    msg.reply('❌ Gunakan:\n.member new @user <nama>\n.member edit-name <lama> <baru>\n.member edit-user <nama> @user\n.member remove @user');
  }
}

module.exports = { handleMember };
