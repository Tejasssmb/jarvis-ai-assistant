# J.A.R.V.I.S — Just A Rather Very Intelligent System

A fully functional personal AI assistant inspired by Tony Stark's Jarvis, 
built from scratch using the MERN stack, Python, and modern AI APIs.
This is not a demo project — it's a real daily-use personal assistant 
running entirely on a personal laptop.

---

## What Jarvis Can Do

### Voice Conversation
- Speak naturally — Jarvis understands any phrasing
- Instant voice recognition via OpenAI Whisper (Groq hosted)
- Natural voice responses via Microsoft Edge TTS
- Hands-free LIVE conversation mode
- Stop speaking mid-sentence anytime
- Cancel thinking mid-request

### Real Intelligence
- Powered by Groq's llama-3.3-70b (GPT-4 level intelligence)
- Automatic fallback to local Ollama llama3.1 when offline
- Truly understands natural language — no keyword commands needed
- Real-time web search via DuckDuckGo for current information
- Always knows current date and time (IST)

### Permanent Memory
- Remembers facts about you across all conversations
- Persistent storage via MongoDB Atlas
- Say "remember that..." and Jarvis never forgets

### Full Windows Automation
- Open any app naturally ("yo open chrome", "launch spotify")
- Open any website ("open amazon", "go to flipkart")
- Search YouTube/Google with natural language
  ("play RRR songs on youtube", "find Mahesh Babu movies")
- Find and open any file on your laptop by name
- System controls: volume, battery, screenshot, wallpaper
- Settings: WiFi, Bluetooth, Display, Task Manager
- Power: shutdown, restart, sleep
- Dynamic command execution — if it's not preset, 
  Jarvis generates and runs Python code on the fly

---

## Architecture
User Voice/Text

↓

React Frontend (Vite + Tailwind) — Port 5173

↓

Node.js + Express Backend — Port 5000

↓

┌───────────────────────────────────┐

│  Groq API (llama-3.3-70b)        │ ← Primary AI Brain

│  Ollama (llama3.1 local)         │ ← Fallback (offline)

│  Groq Whisper (transcription)    │ ← Voice to text

│  MongoDB Atlas                   │ ← Long term memory

│  DuckDuckGo Search               │ ← Real time web data

└───────────────────────────────────┘

↓

Python Flask Voice Service — Port 5001

↓

┌───────────────────────────────────┐

│  Edge TTS (text to speech)       │

│  Windows Automation (pyautogui)  │

│  System Commands (subprocess)    │

│  Dynamic Code Execution          │

└───────────────────────────────────┘

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Voice Service | Python, Flask |
| AI Brain | Groq API (llama-3.3-70b-versatile) |
| Local Fallback | Ollama (llama3.1 8B) |
| Voice Input | OpenAI Whisper (via Groq) |
| Voice Output | Microsoft Edge TTS |
| Database | MongoDB Atlas |
| Web Search | DuckDuckGo (ddgs) |
| Automation | PyAutoGUI, Subprocess |

---

## Project Structure
Jarvis/

├── client/                 # React frontend

│   └── src/

│       └── components/

│           ├── Chat.jsx    # Main chat interface

│           └── Chat.css    # Jarvis UI styling

├── server/                 # Node.js backend

│   ├── models/

│   │   └── Memory.js       # MongoDB memory schema

│   ├── routes/

│   │   ├── chat.js         # Main AI route

│   │   └── memory.js       # Memory CRUD routes

│   └── index.js            # Express server

└── voice-service/          # Python Flask service

└── app.py              # TTS + automation engine

---

## Setup & Installation

### Prerequisites
- Node.js v18+
- Python 3.10+
- Ollama installed
- MongoDB Atlas account (free)
- Groq API key (free)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/jarvis-ai-assistant.git
cd jarvis-ai-assistant
```

### 2. Setup Server
```bash
cd server
npm install
```

Create `server/.env`:
GROQ_API_KEY=your_groq_key_here

MONGO_URI=your_mongodb_uri_here

PORT=5000

### 3. Setup Client
```bash
cd client
npm install
```

### 4. Setup Voice Service
```bash
cd voice-service
pip install flask edge-tts pygame ddgs psutil pyautogui
```

### 5. Pull Ollama Model
```bash
ollama pull llama3.1
```

### 6. Run All Services

**Terminal 1 (Server):**
```bash
cd server && node index.js
```

**Terminal 2 (Client):**
```bash
cd client && npm run dev
```

**Terminal 3 (Voice Service):**
```bash
cd voice-service && python app.py
```

Open **http://localhost:5173** and talk to Jarvis!

---

## Roadmap

- [x] Version 1 — Core chat with local AI
- [x] Version 2 — Voice input/output + hands-free mode
- [x] Version 3 — Real-time web search + date/time
- [x] Version 4 — Long-term memory (MongoDB)
- [x] Version 5 — Full Windows automation + Whisper
- [ ] Version 6 — Wake word "Hey Jarvis" + clap detection
- [ ] Version 7 — Phone companion app
- [ ] Version 8 — Background service (auto-start on boot)

---

## Built By

**Tejas P** — Self-taught developer from Chennai, India
Building real projects with passion, not just for resume.

---

## License

MIT License — feel free to fork and build your own Jarvis!