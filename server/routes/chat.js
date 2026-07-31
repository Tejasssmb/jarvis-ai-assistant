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
const buildSystemPrompt = require("../services/systemPromptService");



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

   const result = await processCommand(message, history);

const finalReply = result.reply;

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