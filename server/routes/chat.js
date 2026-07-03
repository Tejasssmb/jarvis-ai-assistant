const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
dotenv.config();
const axios = require('axios');
const ollama = require('ollama').default;
const Groq = require('groq-sdk');
const Memory = require('../models/Memory');
const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ============================================
// SYSTEM PROMPT BUILDER
// ============================================
async function buildSystemPrompt() {
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric',
    month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
  const currentTime = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit'
  });

  // Load memories
  let memoriesText = '';
  try {
    const memories = await Memory.find().sort({ createdAt: -1 }).limit(10);
    if (memories.length > 0) {
      memoriesText = memories.map(m => m.content).join('\n');
    }
  } catch {}

 return `You are Jarvis, the highly sophisticated AI assistant of Tejas, inspired by Tony Stark's Jarvis.

TODAY: ${currentDate}. CURRENT TIME: ${currentTime} IST

PERSONALITY:
- You are witty, intelligent, and slightly dry in humor
- Always address the user as "sir" naturally in conversation
- You are confident, never uncertain or hesitant
- Occasionally make subtle clever observations
- You speak like a refined British butler who happens to be a genius
- Never say "I cannot" — always find a way or suggest an alternative
- Keep responses SHORT and punchy — real Jarvis never rambles
- Maximum 2-3 sentences for normal replies
- Sound like you're genuinely glad to help, not like a robot

EXAMPLES OF HOW YOU SPEAK:
- "Right away sir." (for commands)
- "Shall I proceed sir?" (when confirming something big)
- "Interesting choice sir." (with subtle humor)
- "Consider it done sir."
- "I'm on it sir."
- "Of course sir, though I'd suggest..."
- "Might I recommend sir..."

YOUR CAPABILITIES:
You can control the user's laptop by returning a special JSON command block.
When the user wants to perform a system action, respond with this exact format AND a natural spoken reply:
When the user asks you to perform an action (open an app, search, set a reminder, etc), respond with natural, brief, confident spoken text as if you have already done it — like Siri or Tony Stark's J.A.R.V.I.S. Never narrate your reasoning, never say things like "let me try that again" or "I'll attempt to," and never mention commands, JSON, or that you are deciding what to do. Just state the result naturally, e.g. "Opening YouTube for you, sir." or "Done, sir."

You must emit EXACTLY ONE JARVIS_CMD block per response, placed at the very end, after your spoken reply. Decide the correct action ONCE — do not second-guess, correct, or emit a second JARVIS_CMD in the same response. If you are unsure which action is correct, pick the most likely one and commit.

Format for simple actions:
<your short natural spoken reply>
JARVIS_CMD:{"type":"preset","action":"ACTION","target":"TARGET","query":"QUERY"}

Format for complex actions:
<your short natural spoken reply>
JARVIS_CMD:{"type":"dynamic","code":"python code","description":"what it does"}

Preset actions:
- open_app → target: chrome, vscode, notepad, calculator, spotify, whatsapp, excel, word, powerpoint, vlc, zoom, telegram
- open_folder → target: desktop, downloads, documents, pictures, music, videos
- open_website → target: any website name
- youtube_search → query: search term
- google_search → query: search term
- open_file → query: filename
- screenshot, battery, volume_up, volume_down, mute
- wallpaper, wifi_settings, bluetooth_settings, display_settings
- task_manager, shutdown, restart, sleep

CRITICAL RULES:
- No markdown, no bullet points, no symbols in speech
- Never say asterisks, hashtags, or brackets out loud
- Always speak naturally as if talking to someone
- For commands, give a short natural confirmation like "Opening Chrome for you sir"
- Never pretend to do things you cannot actually do
IMPORTANT: YouTube, Gmail, Instagram, Netflix, Twitter, LinkedIn, WhatsApp are WEBSITES not apps. Always use open_website action for these, NEVER open_app.

${memoriesText ? `WHAT YOU KNOW ABOUT SIR:\n${memoriesText}` : ''}`;
}
// ============================================
// AI CALL — GROQ PRIMARY, OLLAMA FALLBACK
// ============================================
async function callAI(messages) {
  // Try Groq first
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 200,
    });
    console.log('✅ Groq responded');
    return response.choices[0].message.content;
  } catch (groqError) {
    console.log('⚠️ Groq failed, switching to Ollama:', groqError.message);
    // Fallback to Ollama
    try {
      const response = await ollama.chat({
        model: 'llama3.1',
        messages: messages,
      });
      console.log('✅ Ollama responded');
      return response.message.content;
    } catch (ollamaError) {
      throw new Error('Both Groq and Ollama failed: ' + ollamaError.message);
    }
  }
}

// ============================================
// PARSE COMMAND FROM AI RESPONSE
// ============================================
function parseCommand(reply) {
  const startIdx = reply.indexOf('JARVIS_CMD:');
  if (startIdx === -1) {
    return { hasCommand: false, parsed: null, cleanReply: reply };
  }

  const braceStart = reply.indexOf('{', startIdx);
  if (braceStart === -1) {
    return { hasCommand: false, parsed: null, cleanReply: reply };
  }

  let depth = 0;
  let endIdx = -1;
  for (let i = braceStart; i < reply.length; i++) {
    if (reply[i] === '{') depth++;
    if (reply[i] === '}') depth--;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { hasCommand: false, parsed: null, cleanReply: reply };
  }

  let jsonStr = reply.slice(braceStart, endIdx + 1);
// Fix common Groq JSON errors
jsonStr = jsonStr.replace(/\)$/, '}').replace(/,$/, '');

  try {
    const parsed = JSON.parse(jsonStr);
    const cleanReply = (reply.slice(0, startIdx) + reply.slice(endIdx + 1))
      .replace(/\s+/g, ' ')
      .trim();
    return { hasCommand: true, parsed, cleanReply };
  } catch (e) {
    console.log('Parse error:', e.message);
    return { hasCommand: false, parsed: null, cleanReply: reply };
  }
}
// ============================================
// WEB SEARCH
// ============================================
const searchTriggers = [
  'news', 'latest', 'current', 'recently', 'yesterday', 'tomorrow',
  'weather', 'score', 'match', 'price', 'stock', 'update', 'happened',
  'who won', 'when is', '2025', '2026'
];

const noSearchNeeded = [
  'date', 'time', 'day', 'your name', 'who are you', 'hello', 'hi',
  'how are you', 'open', 'launch', 'play', 'search', 'screenshot',
  'battery', 'volume', 'wallpaper', 'shutdown', 'restart', 'sleep'
];

function needsSearch(message) {
  const lower = message.toLowerCase();
  if (noSearchNeeded.some(skip => lower.includes(skip))) return false;
  return searchTriggers.some(trigger => lower.includes(trigger));
}

async function getSearchResults(query) {
  try {
    const res = await axios.post('http://127.0.0.1:5001/search', { query });
    return res.data.results || [];
  } catch {
    return [];
  }
}

// ============================================
// MEMORY
// ============================================
function shouldSaveMemory(message) {
  const lower = message.toLowerCase();
  return lower.includes('remember') ||
    lower.includes('my name is') ||
    lower.includes('i like') ||
    lower.includes('i hate') ||
    lower.includes('i prefer') ||
    lower.includes('my favorite') ||
    lower.includes('never forget') ||
    lower.includes('keep in mind');
}

async function saveMemory(content) {
  try {
    const Memory = require('../models/Memory');
    const memory = new Memory({ content, type: 'fact' });
    await memory.save();
  } catch {}
}

async function saveReminder(message) {
  try {
    const lower = message.toLowerCase();
    if (!lower.includes('remind') && !lower.includes('reminder')) return;

    // Convert word numbers to digits
    const wordToNum = {
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
      'fifteen': '15', 'twenty': '20', 'thirty': '30', 'forty': '40',
      'forty five': '45', 'sixty': '60'
    };
    
    let normalizedMessage = message;
    for (const [word, num] of Object.entries(wordToNum)) {
      normalizedMessage = normalizedMessage.replace(new RegExp(word, 'gi'), num);
    }

    const now = new Date();
    let reminderTime = null;

    // "in/after X seconds"
    const secondMatch = normalizedMessage.match(/(?:in|after)\s+(\d+)\s+second/i);
    if (secondMatch) {
      reminderTime = new Date(now.getTime() + parseInt(secondMatch[1]) * 1000);
    }

    // "in/after X minutes"
    const minuteMatch = normalizedMessage.match(/(?:in|after)\s+(\d+)\s+minute/i);
    if (minuteMatch) {
      reminderTime = new Date(now.getTime() + parseInt(minuteMatch[1]) * 60000);
    }

    // "in/after X hours"
    const hourMatch = normalizedMessage.match(/(?:in|after)\s+(\d+)\s+hour/i);
    if (hourMatch) {
      reminderTime = new Date(now.getTime() + parseInt(hourMatch[1]) * 3600000);
    }

    // "at X PM/AM"
    const timeMatch = normalizedMessage.match(/at\s+(\d+)(?::(\d+))?\s*(am|pm)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3].toLowerCase();
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      reminderTime = new Date(now);
      reminderTime.setHours(hours, minutes, 0, 0);
    }

    if (reminderTime) {
      await axios.post('http://localhost:5000/api/reminder/save', {
        text: message,
        reminderTime
      });
      console.log(`⏰ Reminder saved for: ${reminderTime}`);
    } else {
      console.log('Could not parse reminder time from:', message);
    }
  } catch (err) {
    console.log('Reminder save error:', err.message);
  }
}
// ============================================
// MAIN ROUTE
// ============================================
router.post('/', async (req, res) => {
  const { message, history } = req.body;
  try {
    let systemContent = await buildSystemPrompt();

    // Add web search context if needed
    if (needsSearch(message)) {
      const results = await getSearchResults(message);
      if (results.length > 0) {
        const searchContext = results
          .slice(0, 2)
          .map(r => `${r.title}: ${r.body.slice(0, 150)}`)
          .join('\n');
        systemContent += `\n\nLIVE WEB RESULTS:\n${searchContext}`;
      }
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...(history || []),
      { role: 'user', content: message }
    ];

    // Call AI (Groq → Ollama fallback)
    const rawReply = await callAI(messages);
    // Parse if it's a command
    const { hasCommand, parsed, cleanReply } = parseCommand(rawReply);

    let finalReply = cleanReply || rawReply;

    if (hasCommand && parsed) {
  try {
    let execRes;
    
    if (parsed.type === 'dynamic') {
      // Dynamic execution path
      execRes = await axios.post('http://127.0.0.1:5001/dynamic', {
        code: parsed.code,
        description: parsed.description
      });
    } else {
      // Preset execution path
      execRes = await axios.post('http://127.0.0.1:5001/execute', { parsed });
    }

   const actionResult = execRes.data.action || 'Done sir';
// For informational commands, speak the actual result not just confirmation
const infoActions = ['battery', 'screenshot', 'volume_up', 'volume_down'];
if (infoActions.includes(parsed.action) && actionResult) {
  finalReply = actionResult;
} else {
  finalReply = cleanReply || actionResult;
  if (!finalReply || finalReply.trim() === '') {
    finalReply = actionResult;
  }
}
  } catch {
    finalReply = cleanReply || 'Done sir';
  }
}

    // Save memory if needed
    if (shouldSaveMemory(message)) {
      await saveMemory(`User said: ${message}`);
    }
    // Save reminder if needed
await saveReminder(message);
    // Speak the reply
    axios.post('http://127.0.0.1:5001/speak', { text: finalReply }).catch(() => {});

    res.json({ reply: finalReply });

  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Rename file with correct extension
    const newPath = req.file.path + '.webm';
    fs.renameSync(req.file.path, newPath);

    console.log('Transcribing file:', newPath);
    console.log('File size:', fs.statSync(newPath).size, 'bytes');

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'json',
    });

    fs.unlinkSync(newPath);
    console.log('Transcription:', transcription.text);
    res.json({ text: transcription.text });

  } catch (error) {
    console.error('Transcription error:', error.message);
    try {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
    res.status(500).json({ error: error.message });
  }
});
router.post('/wake', (req, res) => {
  const { trigger, message, reply } = req.body;
  console.log(`🟢 Jarvis: ${trigger}`);

  if (global.wakeCallback) {
    global.wakeCallback({ trigger, message, reply });
  }
  res.json({ status: 'ok' });
});
module.exports = router;