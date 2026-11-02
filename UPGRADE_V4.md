# Jarvis v4 - what changed and how to use it

## Install (5 minutes)
1. Stop Jarvis (tray icon -> Exit, or double-click `stop_jarvis.bat`).
2. Extract this zip over your project folder, choose **Replace**. Then run `python verify_install.py` -> must say "All files match".
3. `pip install -r voice-service\requirements-voice.txt`   (new: pillow, sherpa-onnx, newer edge-tts)
4. `python jarvis_launcher.py` and wait for the green ticks.
No new npm packages this time.

## One-time setup (do these in order, each takes 1-3 minutes, Jarvis stopped except for step A)
- **A. Pick a voice** (Jarvis running):  `python voice-service\choose_voice.py`
- **B. Teach him YOUR voice** (ignores TV, music, other people):  `python voice-service\enroll_voice.py`
  - answer "Enter" at the video step and play a YouTube video with people talking: the bar is then set from real data.
- **C. Tune "Hey Jarvis" to your normal/quiet voice:**  `python voice-service\calibrate_wake.py`

## What was fixed
| Problem | Cause found | Fix |
|---|---|---|
| WhatsApp asks "Shall I send...?" again and again | speech-to-text writes "Yes." and the code only matched exactly "yes" | any natural yes/no is understood; a question expires after 90 s |
| "I couldn't read your WhatsApp" (error `r`) | the library's getChats() fails completely if ONE of your 509 chats cannot be read | chats are read one by one, broken ones skipped; sending no longer does the fragile "mark as seen" step |
| "couldn't find that chat" | speech-to-text spells names its own way (Nayana / Nayna / Naina) | sound-alike + fuzzy matching; the question names the REAL contact before you say yes |
| 10 s before he speaks | the whole answer was synthesized before the first word was played | speaks sentence by sentence: first words start after ~1 sentence |
| Male voice | hard-coded `en-US-GuyNeural` | calm British female by default + `choose_voice.py` |
| Reacts to TV / fan / music | any speech was accepted for 15 s after waking | owner-voice lock + "too faint to be you" gate + room-noise learning |
| Must repeat "Hey Jarvis" | he was deaf while he talked | "Hey Jarvis" interrupts him (barge-in); `[wake] almost` lines show near misses |
| Corner reactor looks like a demo | line drawing on a colour-keyed window | glass orb with glowing veins, real per-pixel transparency |

## Useful switches (PowerShell, before `python jarvis_launcher.py`)
| Setting | Meaning |
|---|---|
| `$env:JARVIS_VOICE_LOCK_BAR = "0.4"` | lower = more tolerant of your voice, higher = stricter |
| `$env:JARVIS_MIN_SNR_DB = "6"` | lower = accepts quieter speech (default 10) |
| `$env:JARVIS_BARGE_IN = "0"` | turn "Hey Jarvis" interrupting him off |
| `$env:JARVIS_OVERLAY_MODE = "simple"` | use the simple corner overlay instead of the glass orb |
| `$env:JARVIS_OVERLAY = "0"` | no corner overlay at all |
| `$env:JARVIS_DEBUG = "1"` | print what the wake detector hears every 3 s |
Delete `voice-service\owner_voice.json` to switch the voice lock off. Delete `voice-service\wake_config.json` to go back to default wake settings.

## Where to look when something is off
`logs\wake.log` (voice loop): `[time]` lines show where seconds go, `[voice-lock]` shows who he thinks is speaking, `[gate]` shows sounds he ignored, `[wake] almost` shows missed wakes.
`logs\voice.log` (speech): `[tts] first audio after X s`. `logs\server.log`: WhatsApp / email errors.
Self-tests: `python voice-service\test_speak.py`, `python voice-service\diagnose_voice.py`, and in the browser `http://localhost:5000/api/integrations/whatsapp/diagnose`.
