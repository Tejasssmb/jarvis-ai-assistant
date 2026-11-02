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
const executeCommand = require("../services/commandExecutor");
const parseCommand = require("../services/parserService");
const processCommand = require("../services/processCommand");
const { toSpeech } = require("../services/speechFormatter");
const buildSystemPrompt = require("../services/systemPromptService");
const {
  classifyMemory,
  shouldStoreMemory
} = require("../services/memoryClassifier");
const extractMemories =
  require("../services/memoryExtractor");

// ============================================
// AI CALL — GROQ PRIMARY, OLLAMA FALLBACK
// ============================================
const callAI = require("../services/aiService");

// ============================================
// WEB SEARCH
// ============================================
const searchTriggers = [
  'news', 'latest', 'current', 'recently', 'yesterday', 'tomorrow',
  'weather', 'score', 'match', 'price', 'stock', 'update', 'happened',
  'who won', 'when is', '2025', '2026',
  'who is', 'president', 'prime minister', 'ceo', 'release date', 'trending', 'today'
];

const noSearchNeeded = [
  'date', 'time', 'day', 'your name', 'who are you', 'hello', 'hi',
  'how are you', 'open', 'launch', 'play', 'search', 'screenshot',
  'battery', 'volume', 'wallpaper', 'shutdown', 'restart', 'sleep'
];

function needsSearch(message) {
  const lower = message.toLowerCase();
  const has = (word) =>
    new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
  if (noSearchNeeded.some(has)) return false;
  return searchTriggers.some(has);
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

  const memoryPatterns = [
    "my name is",
    "i am",
    "i'm",
    "my project is",
    "my college is",
    "my favorite",
    "i like",
    "i love",
    "my dog",
    "my cat",
    "my birthday",
    "remember that"
  ];

  return memoryPatterns.some(p =>
    lower.includes(p)
  );
}

async function saveMemory(content, type ) {
  try {
    const Memory = require("../models/Memory");

    const existing = await Memory.findOne({
      content,
      type
    });

    if (existing) {
      console.log("Memory already exists");
      return;
    }

    await Memory.create({
      content,
      type
    });

  } catch (err) {
    console.error(err);
  }
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
    
    // whole words only ("phone" must not become "ph1"), longest first ("forty five" before "forty")
    let normalizedMessage = message;
    const words = Object.keys(wordToNum).sort((a, b) => b.length - a.length);
    for (const word of words) {
      normalizedMessage = normalizedMessage.replace(new RegExp(`\\b${word}\\b`, 'gi'), wordToNum[word]);
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
      // "at 7 am" said at 9 pm means tomorrow, not "already overdue"
      if (reminderTime <= now) reminderTime.setDate(reminderTime.getDate() + 1);
    }

    if (reminderTime) {
      // "remind me to call mom in 5 minutes" -> "call mom"
      const taskText = normalizedMessage
        .replace(/\b(please|jarvis|hey|can you|could you)\b/gi, '')
        .replace(/\bremind(?:er)?\s+me\s+(?:to\s+|about\s+|that\s+)?/i, '')
        .replace(/\b(?:in|after)\s+\d+\s+(?:second|minute|hour)s?\b/i, '')
        .replace(/\bat\s+\d+(?::\d+)?\s*(?:am|pm)\b/i, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.-]+|[\s,.-]+$/g, '') || message;

      await axios.post('http://localhost:5000/api/reminder/save', {
        text: taskText,
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

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    // Live web results are handed to the AI through processCommand
    // (they used to be fetched and then thrown away)
    let extraContext = '';
    if (needsSearch(message)) {
      const results = await getSearchResults(message);
      if (results.length > 0) {
        extraContext =
          'LIVE WEB RESULTS (use if relevant, answer briefly):\n' +
          results
            .slice(0, 2)
            .map(r => `${r.title}: ${String(r.body || '').slice(0, 150)}`)
            .join('\n');
      }
    }

    const result = await processCommand(message, history || [], null, extraContext);

    // Wait for screenshot to arrive from the desktop agent
    if (result.parsed && result.parsed.action === 'screenshot') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      result.imageUrl = global.latestScreenshot || null;
    }

    const finalReply = result.reply;

    // What Jarvis SAYS (short, no code/symbols) vs what the screen SHOWS (full reply).
    // "longform" = code or long information: it is shown as text on the Chat page.
    let speech;
    let longform;
    if (result.speech) {
      // email / WhatsApp readers write their own spoken version
      speech = toSpeech(result.speech, { maxChars: 700 }).speech;
      longform = Boolean(result.longform) || finalReply.length > 350 || finalReply.split('\n').length > 4;
    } else {
      const spoken = toSpeech(finalReply);
      speech = spoken.speech;
      longform = spoken.hasCode || spoken.truncated;
    }

    // The voice loop and the chat page send speak:false and play the speech
    // themselves (so they know when he stops). Anything else -> server speaks.
    if (req.body.speak !== false && speech) {
      axios.post('http://127.0.0.1:5001/speak', { text: speech }).catch(() => {});
    }

    // Respond FIRST...
    res.json({
      reply: finalReply,
      speech,
      longform,
      imageUrl: result.imageUrl || null,
    });

    // ...then do the slow bookkeeping in the background
    (async () => {
      try {
        if (req.body.persist) {
          await saveMemory(`User: ${message}\nJarvis: ${finalReply}`, 'conversation');
        }
        const memories = await extractMemories(message);
        if (Array.isArray(memories)) {
          for (const memory of memories) {
            if (memory && memory.content && memory.type) {
              await saveMemory(memory.content, memory.type);
            }
          }
        }
        await saveReminder(message);
      } catch (err) {
        console.error('Background memory/reminder error:', err.message);
      }
    })();

  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Whisper invents text ("Thank you.", "Thanks for watching") on silence/noise.
const WHISPER_GHOSTS = new Set([
  'thank you', 'thanks', 'thanks for watching', 'thank you for watching',
  'bye', 'bye bye', 'subscribe', 'you', 'the end', 'so', 'hmm', 'uh', 'um', 'mm'
]);

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Rename file with correct extension
    const newPath = req.file.path + '.webm';
    fs.renameSync(req.file.path, newPath);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(newPath),
      model: 'whisper-large-v3-turbo',
      language: 'en',
      response_format: 'verbose_json',
      temperature: 0,
      prompt: 'Conversation with Jarvis, a personal assistant. Commands like open Chrome, play a song, set a reminder, take a screenshot.',
    });

    fs.unlinkSync(newPath);

    // Keep only segments Whisper is confident are real speech
    const segments = transcription.segments || [];
    let text = segments.length
      ? segments
          .filter(s =>
            (s.no_speech_prob ?? 0) < 0.5 &&
            (s.avg_logprob ?? 0) > -1.0 &&
            (s.compression_ratio ?? 0) < 2.4
          )
          .map(s => s.text)
          .join(' ')
          .trim()
      : (transcription.text || '').trim();

    // Strict mode (continuous conversation): also drop known hallucinations
    if (req.body.strict === '1') {
      const norm = text.toLowerCase().replace(/[^a-z' ]/g, '').trim();
      if (!norm || WHISPER_GHOSTS.has(norm)) text = '';
    }

    console.log('Transcription:', JSON.stringify(text));
    res.json({ text });

  } catch (error) {
    console.error('Transcription error:', error.message);
    try {
      if (req.file && fs.existsSync(req.file.path + '.webm')) fs.unlinkSync(req.file.path + '.webm');
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
    res.status(500).json({ error: error.message });
  }
});

// Only the voice loop running on THIS computer may push events to the UI.
function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// Latest voice state, so a freshly opened Jarvis window can sync instantly.
global.voiceState = { state: 'idle', live: false };

// What was said by voice recently, so the Chat page can show it even if it
// was opened AFTER the conversation happened (long answers open it on demand).
global.voiceFeed = [];
function pushFeed(item) {
  global.voiceFeed.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    ...item,
  });
  if (global.voiceFeed.length > 60) global.voiceFeed.splice(0, global.voiceFeed.length - 60);
}

router.post('/wake', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'local only' });

  const { trigger, state, live, message, reply, via, speech, longform } = req.body;
  console.log(`🟢 Jarvis: ${trigger}${state ? ' / ' + state : ''}`);

  if (state) global.voiceState = { state, live: !!live };
  if (message) pushFeed({ role: 'user', content: String(message) });
  if (reply) pushFeed({ role: 'assistant', content: String(reply), longform: !!longform });

  if (global.wakeCallback) {
    global.wakeCallback({ trigger, state, live, message, reply, via, speech, longform });
  }
  res.json({ status: 'ok' });
});

router.get('/voice-feed', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'local only' });
  const since = Number(req.query.since) || 0;
  res.json({ items: global.voiceFeed.filter(i => i.ts > since) });
});

router.get('/voice-state', (req, res) => {
  if (!isLocal(req)) return res.status(403).json({ error: 'local only' });
  res.json(global.voiceState);
});

module.exports = router;