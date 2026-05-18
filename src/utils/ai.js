const OpenAI = require('openai');
const config = require('../config');

const SYSTEM_PROMPT = `Kamu adalah asisten AI pribadi di WhatsApp grup.

Aturan:
- Kamu HANYA bisa menjawab berdasarkan data yang sudah disediakan di bawah ini.
- Jika user bertanya sesuatu di luar data yang diberikan, jawab dengan: "Maaf, saya hanya bisa membantu pertanyaan seputar data yang tersedia."
- Jangan membuat atau mengarang data yang tidak ada.
- Gunakan bahasa Indonesia yang santai dan informatif.
- Jika ada mention user, gunakan nama display_name untuk merujuk ke pengguna.
- Gunakan format teks WhatsApp: *teks* untuk tebal (BUKAN **teks**), _teks_ untuk miring. Jangan gunakan markdown seperti ##, **, atau bullet - (gunakan • jika perlu bullet).`;

let openai = null;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  isInitialized = true;

  if (config.ai.enabled && config.ai.apiUrl) {
    openai = new OpenAI({
      baseURL: config.ai.apiUrl,
      apiKey: config.ai.apiKey || 'ollama',
      timeout: 30000,
      maxRetries: 1,
    });
  }
}

function isReady() {
  init();
  return openai !== null;
}

async function askAI(userPrompt, contextData) {
  init();
  if (!openai) return null;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Berikut data konteks yang tersedia:\n${JSON.stringify(contextData, null, 2)}` },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: config.ai.model,
      messages,
      temperature: 0.1,
    });

    return response.choices[0].message.content
      .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')  // ***bold-italic*** → *bold-italic*
      .replace(/\*\*(.+?)\*\*/g, '*$1*');      // **bold** → *bold*
  } catch (err) {
    throw new Error(`Gagal terhubung ke AI: ${err.message}`);
  }
}

module.exports = { isReady, askAI };
