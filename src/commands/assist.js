const config = require('../config');
const { nowWIB } = require('../shared/parser');

function handleAssist(msg, args, db, features) {
  // Only super admin can use this
  const waUserId = msg.author || msg.from;
  if (!config.superAdminUserId) return;
  const sender = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get(waUserId);
  if (!sender || sender.id !== config.superAdminUserId) return;

  const sub = (args[0] || '').toLowerCase();
  const waGroupId = msg.from;

  if (sub === 'status') {
    const row = db.prepare('SELECT feature_name FROM group_features WHERE wa_group_id = ?').get(waGroupId);
    if (row) {
      msg.reply(`📋 Fitur aktif: *${row.feature_name}*`);
    } else {
      msg.reply('📋 Belum ada fitur aktif di grup ini.');
    }
  } else if (sub === 'set') {
    const featureName = args[1];
    if (!featureName) {
      msg.reply('❌ Gunakan: .assist set <feature>\nFitur tersedia: ' + [...features.keys()].join(', '));
      return;
    }
    if (!features.has(featureName)) {
      msg.reply('❌ Fitur tidak ditemukan.\nFitur tersedia: ' + [...features.keys()].join(', '));
      return;
    }
    const ts = nowWIB();
    db.prepare('INSERT OR REPLACE INTO group_features (wa_group_id, feature_name, assigned_at) VALUES (?, ?, ?)').run(waGroupId, featureName, ts);
    msg.reply(`✅ Fitur *${featureName}* aktif di grup ini.`);
  } else if (sub === 'none') {
    db.prepare('DELETE FROM group_features WHERE wa_group_id = ?').run(waGroupId);
    msg.reply('✅ Fitur dihapus dari grup ini.');
  } else {
    msg.reply('❌ Gunakan:\n.assist status — Lihat fitur aktif\n.assist set <feature> — Aktifkan fitur\n.assist none — Hapus fitur');
  }
}

module.exports = { handleAssist };
