const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

require('dotenv').config();

const superAdminUserId = parseInt(process.env.SUPER_ADMIN_USER_ID, 10) || 0;
const whitelistEnabled = process.env.WHITELIST_ENABLED === 'true';

const aiEnabled = process.env.AI_ENABLED === 'true';
const aiProvider = process.env.AI_PROVIDER || 'ollama';
const aiModel = process.env.AI_MODEL || 'llama3.2';
const aiApiUrl = process.env.AI_API_URL || 'http://localhost:11434/v1';
const aiApiKey = process.env.AI_API_KEY || '';
const aiContextMaxRows = parseInt(process.env.AI_CONTEXT_MAX_ROWS, 10) || 0;

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

  // Super admin
  superAdminUserId,

  // Whitelist
  whitelistEnabled,

  // AI
  ai: {
    enabled: aiEnabled,
    provider: aiProvider,
    model: aiModel,
    apiUrl: aiApiUrl,
    apiKey: aiApiKey,
    contextMaxRows: aiContextMaxRows,
  },

  // Rate limits
  rateLimits: {
    publicCommand: { max: 1, windowMs: 60_000 },
    futurePublicCommand: { max: 2, windowMs: 60_000 },
    unregisteredRejection: { max: 1, windowMs: 60_000 }
  },

  // WhatsApp display config
  qrCode: {
    small: true
  }
};
