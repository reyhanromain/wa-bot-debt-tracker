const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

module.exports = {
  // WhatsApp client config
  client: new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, '..', 'data', '.wwebjs_auth')
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  }),

  // Bot config
  commandPrefix: '.',
  timezone: 'Asia/Jakarta',
  locale: 'id-ID',

  // Rate limits
  rateLimits: {
    publicCommand: { max: 1, windowMs: 60_000 },      // .help
    futurePublicCommand: { max: 2, windowMs: 60_000 }, // future public commands
    unregisteredRejection: { max: 1, windowMs: 60_000 } // rejection msg for unregistered users
  },

  // WhatsApp display config
  qrCode: {
    small: true
  }
};
