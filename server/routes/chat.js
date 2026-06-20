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

  return `You are Jarvis, a highly intelligent personal AI assistant like Tony Stark's Jarvis.
TODAY: ${currentDate}, TIME: ${currentTime} IST

YOU CAN CONTROL THE USER'S LAPTOP in two ways:

WAY 1 - PRESET (use for common actions, faster):
JARVIS_CMD:{"type":"preset","action":"ACTION","target":"TARGET","query":"QUERY"}

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

WAY 2 - DYNAMIC (use for anything not in preset list):
JARVIS_CMD:{"type":"dynamic","code":"python code here","description":"what it does"}

Dynamic code can use: pyautogui, subprocess, os, time, psutil, webbrowser, ctypes
NEVER generate code that deletes files or damages the system.

CRITICAL: These are WEBSITES not apps, always use open_website action:
gmail → open_website target:gmail
whatsapp → open_website target:whatsapp  
instagram → open_website target:instagram
netflix → open_website target:netflix
youtube → open_website target:youtube
twitter → open_website target:twitter
linkedin → open_website target:linkedin
NEVER use open_app for any of these.

EXAMPLES:
"open chrome" → JARVIS_CMD:{"type":"preset","action":"open_app","target":"chrome","query":""}
"play RRR songs on youtube" → JARVIS_CMD:{"type":"preset","action":"youtube_search","target":"","query":"RRR songs"}
"minimize all windows" → JARVIS_CMD:{"type":"dynamic","code":"import pyautogui; pyautogui.hotkey('win', 'd')","description":"Minimized all windows"}
"type hello in notepad" → JARVIS_CMD:{"type":"dynamic","code":"import pyautogui; import time; time.sleep(0.5); pyautogui.typewrite('hello', interval=0.05)","description":"Typed hello"}
"open amazon" → JARVIS_CMD:{"type":"preset","action":"open_website","target":"amazon","query":""}
"what's my battery" → JARVIS_CMD:{"type":"preset","action":"battery","target":"","query":""}
"can you open whatsapp?" → JARVIS_CMD:{"type":"preset","action":"open_app","target":"whatsapp","query":""}
"take a screenshot and open it" → JARVIS_CMD:{"type":"dynamic","code":"import pyautogui; import os; import time; path='C:/Users/${process.env.USERNAME}/Desktop/jarvis_ss.png'; pyautogui.screenshot(path); time.sleep(0.5); os.startfile(path)","description":"Screenshot taken and opened"}
"open notepad and type hello" → JARVIS_CMD:{"type":"dynamic","code":"import subprocess; import time; subprocess.Popen('notepad.exe'); time.sleep(1.5); import pyautogui; pyautogui.typewrite('hello', interval=0.05)","description":"Opened notepad and typed hello"}
 
CONVERSATION RULES:
- Speak naturally, like a real assistant
- Under 40 words for normal replies unless asked for detail
- No markdown, no bullet points, no symbols
- Use memories about the user naturally
- For questions/conversation reply normally without JARVIS_CMD

${memoriesText ? `WHAT YOU KNOW ABOUT THE USER:\n${memoriesText}` : ''}`;
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
  const cmdMatch = reply.match(/JARVIS_CMD:(\{[^}]+\})/);
  if (cmdMatch) {
    try {
      const parsed = JSON.parse(cmdMatch[1]);
      const cleanReply = reply.replace(/JARVIS_CMD:\{[^}]+\}/, '').trim();
      return { hasCommand: true, parsed, cleanReply };
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  }
  return { hasCommand: false, parsed: null, cleanReply: reply };
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
    finalReply = cleanReply || actionResult;
    if (!finalReply || finalReply.trim() === '') {
      finalReply = actionResult;
    }
  } catch {
    finalReply = cleanReply || 'Done sir';
  }
}

    // Save memory if needed
    if (shouldSaveMemory(message)) {
      await saveMemory(`User said: ${message}`);
    }

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
module.exports = router;