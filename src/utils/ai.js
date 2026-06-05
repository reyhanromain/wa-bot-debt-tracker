const OpenAI = require('openai');
const config = require('../config');

let openai = null;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  isInitialized = true;
  if (config.ai.enabled && config.ai.apiUrl) {
    openai = new OpenAI({
      baseURL: config.ai.apiUrl,
      apiKey: config.ai.apiKey || 'ollama',
      timeout: 60000,
      maxRetries: 1,
    });
  }
}

function isReady() {
  init();
  return openai !== null;
}

function formatReply(text) {
  return (text || '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*');
}

async function callModel(messages, { withTools, tools }) {
  const payload = {
    model: config.ai.model,
    messages,
    temperature: 0.1,
  };
  if (withTools && tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }
  try {
    return await openai.chat.completions.create(payload);
  } catch (err) {
    throw new Error(`Gagal terhubung ke AI: ${err.message}`);
  }
}

/**
 * Run a tool-calling loop against the configured OpenAI-compatible endpoint.
 * The model decides which tools to call; this loop executes them and feeds
 * results back until the model produces a final assistant message.
 *
 * @param {object} opts
 * @param {string} opts.prompt - User message text.
 * @param {string} opts.systemPrompt - System prompt describing the assistant.
 * @param {Array} opts.tools - OpenAI tool specs (`type:'function'` objects).
 * @param {(name, args, ctx) => any} opts.executeTool - Tool dispatcher.
 * @param {object} opts.toolContext - Opaque context handed to executeTool (db, ids…).
 * @param {number} [opts.maxIterations=5] - Cap on tool-call rounds.
 * @returns {Promise<string>} - Final assistant text (WhatsApp-formatted).
 */
async function askAI({ prompt, systemPrompt, tools, executeTool, toolContext, maxIterations = 5 }) {
  init();
  if (!openai) return null;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await callModel(messages, { withTools: true, tools });
    const responseMsg = response.choices[0].message;
    messages.push(responseMsg);

    if (!responseMsg.tool_calls || responseMsg.tool_calls.length === 0) {
      return formatReply(responseMsg.content);
    }

    for (const call of responseMsg.tool_calls) {
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(call.function.arguments || '{}');
      } catch {
        parsedArgs = {};
      }
      const result = await executeTool(call.function.name, parsedArgs, toolContext);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Iteration cap hit — force a final answer without tools.
  messages.push({
    role: 'user',
    content: 'Berdasarkan hasil tool di atas, berikan jawaban final ke user sekarang. Jangan panggil tool lagi.',
  });
  try {
    const finalResp = await callModel(messages, { withTools: false });
    return formatReply(finalResp.choices[0].message.content);
  } catch {
    return 'Maaf, saya tidak bisa menyelesaikan analisis dalam batas iterasi.';
  }
}

module.exports = { isReady, askAI };
