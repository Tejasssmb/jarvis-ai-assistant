"""
wake.py — J.A.R.V.I.S voice loop (runs all the time, started by jarvis_launcher.py)

    STANDBY  mic -> openWakeWord ("hey jarvis")         (Ctrl+Space also wakes)
       |
       v   "Hey Jarvis" — works from ANY app (YouTube, WhatsApp, desktop...)
    WAKE     1. open / focus the arc-reactor window
             2. speak the startup briefing (first wake, then every 2 h)
                or just "Yes, sir?"   — skipped if you speak the command at once
       |
       v
    SESSION  listen (Silero VAD) -> transcribe -> chat -> speak -> repeat
             * mic is OFF while Jarvis speaks (he never hears himself)
             * for FOLLOW_UP_SEC after Jarvis speaks, no wake word is needed
             * normal session: ends after FOLLOW_UP_SEC of silence -> STANDBY
             * LIVE mode (button in Chat page): never times out; outside the
               follow-up window only speech that starts with "Jarvis" (or where
               the wake-word model fires) is accepted -> background talk is ignored

Install (once):
    pip install openwakeword==0.4.0 sounddevice numpy requests keyboard psutil flask flask-cors
"""
import io
import json
import os
import queue
import random
import re
import threading
import time
import wave
import sys

# When started by the launcher, output goes to a log file. Windows would then use
# a legacy encoding and crash on emoji / curly quotes, so force UTF-8.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from collections import deque
from datetime import datetime
from types import SimpleNamespace

import numpy as np
import requests

import tts_engine

# ============================================
# CONFIGURATION
# ============================================
NODE_URL = "http://localhost:5000"
TRANSCRIBE_URL = f"{NODE_URL}/api/chat/transcribe"
CHAT_URL = f"{NODE_URL}/api/chat"
EVENT_URL = f"{NODE_URL}/api/chat/wake"
STARTUP_URL = f"{NODE_URL}/api/startup"
SPEAK_URL = "http://127.0.0.1:5001/speak"
STOP_URL = "http://127.0.0.1:5001/stop"

CONTROL_PORT = 5002
UI_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

SAMPLE_RATE = 16000
CHUNK = 1280                      # 80 ms of audio per read (what openWakeWord wants)

def _load_calibration():
    """wake_config.json is written by calibrate_wake.py (it measures YOUR voice)."""
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wake_config.json")
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


_CAL = _load_calibration()


def _setting(env_name, key, default):
    """environment variable > calibration file > built-in default"""
    if os.getenv(env_name):
        return float(os.getenv(env_name))
    return float(_CAL.get(key, default))


# Measured defaults: "Hey Jarvis, what time is it" in one breath failed at 0.5/0.3 on 3 of 4 volumes.
WAKE_THRESHOLD = _setting("JARVIS_WAKE_THRESHOLD", "strong", 0.4)   # ONE chunk this high wakes him
WAKE_SOFT = _setting("JARVIS_WAKE_SOFT", "soft", 0.2)               # ...or TWO chunks this high (quiet voice)
DETECT_GAIN = _setting("JARVIS_DETECT_GAIN", "gain", 3.0)           # boosts a quiet laptop mic for detection only
OPEN_WINDOW_ON_WAKE = os.getenv("JARVIS_OPEN_WINDOW_ON_WAKE") == "1"  # default: stay in the background
WAKE_COOLDOWN_SEC = 3.0
HOTKEY = "ctrl+space"
MIC_DEVICE = os.getenv("JARVIS_MIC") or None        # device number or name; see list at startup
MIC_GAIN = float(os.getenv("JARVIS_MIC_GAIN", "1.0"))  # raw gain on everything (normally leave at 1.0)
DEBUG = os.getenv("JARVIS_DEBUG") == "1"               # print what the wake detector hears every 3 s

BRIEFING_COOLDOWN_MIN = 120       # full startup briefing at most every 2 h (0 = every wake)
DIRECT_COMMAND_WAIT = 1.0         # "Hey Jarvis <command>" in one breath skips the briefing
FOLLOW_UP_SEC = 15.0              # after Jarvis speaks you can answer without the wake word

VAD_START = 0.6                   # speech probability to START an utterance
VAD_CONTINUE = 0.4                # ...and to KEEP it going
START_CHUNKS = 2                  # consecutive speech chunks (160 ms) to start
END_SILENCE_MS = 900              # silence that ends your sentence
MIN_SPEECH_MS = 500               # shorter than this = cough/click, ignored
MAX_UTTERANCE_MS = 20000
PRE_ROLL_CHUNKS = 4               # keep 320 ms before speech start (don't clip first word)
POST_SPEAK_DELAY = 0.35           # let room echo fade before the mic re-opens
MAX_HISTORY = 12                  # messages of context sent with each question

BARGE_IN = os.getenv("JARVIS_BARGE_IN", "1") != "0"                    # "Hey Jarvis" works while he is talking
BARGE_THRESHOLD = float(os.getenv("JARVIS_BARGE_THRESHOLD", "0.6"))    # stricter than normal: his own voice is in the mic
MIN_SNR_DB = float(os.getenv("JARVIS_MIN_SNR_DB", "10"))               # speech must be this much louder than the room
MIN_SPEECH_DB = float(os.getenv("JARVIS_MIN_SPEECH_DB", "-50"))        # ...and not fainter than this

WAKE_RE = re.compile(
    r"^\s*(?:hey|hi|ok|okay)?[\s,]*(?:jarvis|jarvas|jarves|jarvus|service)\b[\s,.:!?-]*", re.I
)
END_RE = re.compile(
    r"\b(stop listening|that'?s all|that will be all|goodbye|good night|never ?mind|go to sleep)\b", re.I
)
SHORT_OK = re.compile(r"^(yes|no|yeah|nope|stop|cancel|ok|okay|proceed|continue|sure)\W*$", re.I)
ACKS = ["Yes, sir?", "At your service, sir.", "Listening, sir.", "How can I help, sir?"]


# ============================================
# SIDE EFFECTS (network) — kept separate so the logic can be tested offline
# ============================================
class Backends:
    def __init__(self):
        self.http = requests.Session()

    def post_event(self, payload):
        try:
            self.http.post(EVENT_URL, json=payload, timeout=3)
        except Exception:
            pass

    def transcribe(self, wav_bytes):
        try:
            res = self.http.post(
                TRANSCRIBE_URL,
                files={"audio": ("speech.wav", wav_bytes, "audio/wav")},
                data={"strict": "1"},
                timeout=30,
            )
            if res.status_code == 200:
                return (res.json().get("text") or "").strip()
        except Exception as exc:
            print(f"[stt] transcription failed: {exc}")
        return ""

    def chat(self, message, history):
        try:
            res = self.http.post(
                CHAT_URL,
                json={"message": message, "history": history, "speak": False, "persist": True},
                timeout=60,
            )
            if res.status_code == 200:
                return res.json()
        except Exception as exc:
            print(f"[chat] request failed: {exc}")
        return {}

    def briefing(self):
        try:
            res = self.http.get(STARTUP_URL, timeout=5)
            if res.status_code == 200:
                data = res.json()
                text = (data.get("speech") or data.get("briefing") or "").strip()
                if text:
                    return text
        except Exception:
            pass
        hour = datetime.now().hour
        tod = "morning" if hour < 12 else "afternoon" if hour < 18 else "evening"
        return f"Good {tod}, sir. All systems operational. How may I assist you today?"

    def speak(self, text):
        """Blocks until the audio has finished playing. Never fails silently."""
        try:
            res = self.http.post(SPEAK_URL, json={"text": text}, timeout=180)
            if res.status_code == 200:
                info = res.json() or {}
                if info.get("engine") in ("windows", "mixed"):
                    print("[tts] spoke with the Windows voice (the online voice failed - see logs\\voice.log)")
                return info
            print(f"[tts] voice service answered {res.status_code}: {res.text[:300]}")
        except Exception as exc:
            print(f"[tts] voice service unreachable: {exc}")
        try:                                               # last resort: speak it ourselves
            tts_engine.windows_speak(text)
            print("[tts] spoke with the Windows voice")
        except Exception as exc:
            print(f"[tts] NO VOICE AVAILABLE: {exc}")

    def stop_speaking(self):
        try:
            self.http.post(STOP_URL, timeout=3)
        except Exception:
            pass


# ============================================
# WAKE DECISION
# ============================================
def chunk_db(chunk):
    rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
    return 20 * np.log10(max(rms, 1.0) / 32768)


class WakeTrigger:
    """
    Wakes on ONE strong score (>= strong), or on TWO softer scores (>= soft) within
    the last few chunks. The second rule is what lets a normal, quiet voice wake him
    without having to shout; a single random blip still can't.
    """
    def __init__(self, strong=None, soft=None, window=4):
        self.strong = WAKE_THRESHOLD if strong is None else strong
        self.soft = WAKE_SOFT if soft is None else soft
        self.recent = deque(maxlen=window)

    def update(self, score):
        self.recent.append(score)
        if score >= self.strong:
            return True
        return sum(1 for x in self.recent if x >= self.soft) >= 2

    def reset(self):
        self.recent.clear()


# ============================================
# MICROPHONE
# ============================================
class Mic:
    def __init__(self, device=None):
        self.device = int(device) if (device and str(device).isdigit()) else device
        self.q = queue.Queue(maxsize=300)
        self.muted = False
        self.stream = None
        self.last_callback = time.time()

    def _callback(self, indata, frames, time_info, status):
        self.last_callback = time.time()
        if self.muted:
            return
        data = indata[:, 0]
        if MIC_GAIN != 1.0:
            data = np.clip(data.astype(np.int32) * MIC_GAIN, -32768, 32767).astype(np.int16)
        else:
            data = data.copy()
        try:
            self.q.put_nowait(data)
        except queue.Full:
            pass

    def start(self):
        import sounddevice as sd

        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=1, dtype="int16",
            blocksize=CHUNK, device=self.device, callback=self._callback,
        )
        self.stream.start()
        self.last_callback = time.time()

    def restart(self):
        try:
            if self.stream:
                self.stream.stop()
                self.stream.close()
        except Exception:
            pass
        self.start()

    def get(self, timeout=0.25):
        try:
            return self.q.get(timeout=timeout)
        except queue.Empty:
            return None

    def flush(self):
        while True:
            try:
                self.q.get_nowait()
            except queue.Empty:
                break

    def healthy(self):
        return (time.time() - self.last_callback) < 5.0


# ============================================
# THE VOICE LOOP
# ============================================
class VoiceLoop:
    def __init__(self, backends, mic, wake_model, vad, ui=None, clock=time.time, sleep=time.sleep, speaker=None):
        self.b = backends
        self.mic = mic
        self.wake_model = wake_model
        self.vad = vad
        self.ui = ui
        self.now = clock
        self.sleep = sleep
        self.speaker = speaker           # owner-voice lock (or None)
        self.noise_db = -55.0            # how loud the room is when nobody speaks (fan, hum, far-away TV)
        self._noise_hist = deque(maxlen=150)
        self.last_utt = {}
        self.barged = False
        self._loop_thread = None

        self.state = "idle"            # idle | listening | thinking | speaking
        self.active = False            # a session is running
        self.live = False              # LIVE (hands-free) mode
        self.shutdown = False
        self.stop_flag = False
        self.need_reset = False

        self.history = []
        self.last_wake = 0.0
        self.last_briefing = None
        self.recent = deque(maxlen=PRE_ROLL_CHUNKS)
        self.trigger = WakeTrigger()

        self.requests = queue.Queue()  # wake / live requests from hotkey, UI, tray
        self.speak_lock = threading.RLock()
        self.events = queue.Queue()
        threading.Thread(target=self._event_worker, daemon=True).start()

    # ---------- events to the UI ----------
    def _event_worker(self):
        while True:
            payload = self.events.get()
            self.b.post_event(payload)

    def _emit(self, **payload):
        payload.setdefault("state", self.state)
        payload.setdefault("live", self.live)
        self.events.put(payload)

    def _set_state(self, state):
        if state != self.state:
            self.state = state
            self._emit(trigger="state")

    # ---------- audio helpers ----------
    def _apply_reset(self):
        if self.need_reset:
            self.need_reset = False
            try:
                self.wake_model.reset()
                self.vad.reset_states()
            except Exception:
                pass

    @staticmethod
    def _boost(chunk):
        """Louder copy used ONLY for detection (wake word + speech detector)."""
        if DETECT_GAIN == 1.0:
            return chunk
        peak = int(np.max(np.abs(chunk.astype(np.int32)))) if chunk.size else 0
        gain = DETECT_GAIN if peak == 0 else max(1.0, min(DETECT_GAIN, 30000.0 / peak))   # loud speech is never clipped
        return np.clip(chunk.astype(np.float32) * gain, -32768, 32767).astype(np.int16)

    def _wake_score(self, chunk):
        scores = self.wake_model.predict(self._boost(chunk))
        return max(scores.values()) if scores else 0.0

    @staticmethod
    def _to_wav(chunks):
        audio = np.concatenate(chunks).astype(np.float32)
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if 0 < peak < 20000:                       # quiet recording: lift it for Whisper (max x8)
            audio = audio * min(8.0, 20000.0 / peak)
        pcm = np.clip(audio, -32768, 32767).astype(np.int16).tobytes()
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm)
        return buf.getvalue()

    # ---------- speaking ----------
    def _barge_monitor(self, stop_evt):
        """While he talks: listen only for "Hey Jarvis". If you say it, he stops and listens."""
        hits = 0
        while not stop_evt.is_set():
            chunk = self.mic.get(0.1)
            if chunk is None:
                continue
            score = self._wake_score(chunk)
            hits = hits + 1 if score >= BARGE_THRESHOLD else max(0, hits - 1)
            if hits >= 2:
                print(f"[barge-in] you interrupted (score {score:.2f})")
                self.barged = True
                self.b.stop_speaking()
                return

    def say(self, text):
        text = (text or "").strip()
        if not text:
            return
        with self.speak_lock:
            # In a conversation the mic stays open so "Hey Jarvis" can interrupt him.
            # (Reminders / alerts spoken from other threads still mute the mic.)
            barge = BARGE_IN and self.active and threading.get_ident() == self._loop_thread
            if not barge:
                self.mic.muted = True
            self.barged = False
            self._set_state("speaking")
            stop_evt = threading.Event()
            monitor = None
            if barge:
                monitor = threading.Thread(target=self._barge_monitor, args=(stop_evt,), daemon=True)
                monitor.start()
            try:
                info = self.b.speak(text)
                if isinstance(info, dict) and info.get("first_audio_s") is not None:
                    print(f"[time] first audio after {info['first_audio_s']}s (whole answer {info.get('total_s')}s)")
            finally:
                stop_evt.set()
                if monitor:
                    monitor.join(timeout=1.0)
                self.sleep(POST_SPEAK_DELAY)
                if not self.barged:
                    self.mic.flush()                  # drop the echo of his own voice
                self.mic.muted = False
                self.need_reset = True
                self._set_state("listening" if self.active else "idle")

    def interrupt(self):
        self.b.stop_speaking()

    # ---------- listening for one utterance ----------
    def _listen(self, deadline):
        """
        Wait for the user to say something.
        Returns (chunks, wake_seen) | None if `deadline` passed (None = wait forever).
        """
        pre_roll = deque(self.recent, maxlen=PRE_ROLL_CHUNKS)
        started = False
        speech_run = 0
        chunks = []
        speech_ms = 0
        silence_ms = 0
        total_ms = 0
        last_wake_time = -1e9
        start_time = None
        speech_dbs = []

        while not self.stop_flag and not self.shutdown:
            if deadline is not None and not started and self.now() >= deadline:
                return None
            chunk = self.mic.get(0.25)
            self._apply_reset()
            if chunk is None:
                continue
            self.recent.append(chunk)

            if self._wake_score(chunk) >= WAKE_SOFT:
                last_wake_time = self.now()

            prob = float(self.vad.predict(self._boost(chunk)[:960]))      # 2 x 30 ms frames

            if not started:
                if prob < 0.2:
                    self._track_noise(chunk)
                pre_roll.append(chunk)
                speech_run = speech_run + 1 if prob >= VAD_START else 0
                if speech_run >= START_CHUNKS:
                    started = True
                    start_time = self.now()
                    chunks = list(pre_roll)
                    speech_ms = START_CHUNKS * 80
                    silence_ms = 0
                    total_ms = len(chunks) * 80
                    speech_dbs = []
                    self._set_state("listening")
                continue

            chunks.append(chunk)
            total_ms += 80
            if prob >= VAD_CONTINUE:
                speech_ms += 80
                silence_ms = 0
                speech_dbs.append(chunk_db(chunk))
            else:
                silence_ms += 80

            if silence_ms >= END_SILENCE_MS or total_ms >= MAX_UTTERANCE_MS:
                if speech_ms < MIN_SPEECH_MS:                # blip: cough, click, door
                    started, speech_run, chunks = False, 0, []
                    pre_roll.clear()
                    self.vad.reset_states()
                    continue
                wake_seen = last_wake_time >= (start_time - 0.6)
                self.last_utt = {
                    "speech_db": float(np.median(speech_dbs)) if speech_dbs else -90.0,
                    "noise_db": self.noise_db,
                    "seconds": total_ms / 1000.0,
                }
                return chunks, wake_seen
        return None

    def _track_noise(self, chunk):
        """
        How loud is the room when nobody is talking (fan, hum, distant TV)? The quiet floor of the
        last ~12 seconds: short bursts of speech don't move it, a fan switched on later does.
        """
        self._noise_hist.append(chunk_db(chunk))
        if len(self._noise_hist) >= 25:
            self.noise_db = float(min(-30.0, max(-75.0, np.percentile(self._noise_hist, 25))))

    def _is_owner(self, chunks):
        """Owner-voice lock: is this YOUR voice? (always yes when the lock is off)"""
        if not self.speaker:
            return True
        try:
            ok, score, bar = self.speaker.check(np.concatenate(chunks))
        except Exception as exc:                          # a bug must never lock the owner out
            print(f"[voice-lock] error ({exc}); accepting")
            return True
        if score is None:
            return True
        print(f"[voice-lock] {'your voice' if ok else 'NOT your voice - ignored'} (score {score:.2f}, bar {bar:.2f})")
        return ok

    # ---------- deciding if speech was meant for Jarvis ----------
    @staticmethod
    def gate(text, wake_seen, in_window):
        """-> (action, cleaned_text)   action: ignore | ack | end | say"""
        t = (text or "").strip()
        if not t:
            return "ignore", ""
        m = WAKE_RE.match(t)
        addressed = bool(m) or wake_seen
        if m:
            t = t[m.end():].strip()
        if not (in_window or addressed):
            return "ignore", ""                # background talk
        if not t:
            return "ack", ""                   # he only said "Jarvis"
        if len(t.split()) < 2 and not SHORT_OK.match(t):
            return "ignore", ""
        if END_RE.search(t):
            return "end", t
        return "say", t

    # ---------- one conversation turn ----------
    def _turn(self, text):
        self.history.append({"role": "user", "content": text})
        self._emit(trigger="message", message=text)
        self._set_state("thinking")
        t0 = time.time()
        data = self.b.chat(text, self.history[-MAX_HISTORY:])
        print(f"[time] Jarvis's answer took {time.time() - t0:.1f}s")
        reply = (data.get("reply") or "").strip()
        if not reply:
            reply = "I'm having trouble reaching my servers, sir."
            speech = reply
        else:
            speech = (data.get("speech") or reply).strip()
        self.history.append({"role": "assistant", "content": reply})
        self.history[:] = self.history[-MAX_HISTORY * 2:]
        longform = bool(data.get("longform"))
        self._emit(trigger="reply", reply=reply, speech=speech, longform=longform)
        if longform and self.ui:
            # code / long information: show it as text on the Chat page
            threading.Thread(target=self.ui.show_jarvis, kwargs={"path": "/chat"}, daemon=True).start()
        self.say(speech)

    def _should_brief(self):
        if self.last_briefing is None or BRIEFING_COOLDOWN_MIN <= 0:
            return True
        return (self.now() - self.last_briefing) >= BRIEFING_COOLDOWN_MIN * 60

    def _handle_utterance(self, chunks, wake_seen, in_window):
        """Returns 'continue' or 'end'."""
        # 1) background sound? (far-away TV / music / people are much fainter than you at the microphone)
        u = self.last_utt
        if u and not wake_seen:
            if u["speech_db"] < MIN_SPEECH_DB or u["speech_db"] - u["noise_db"] < MIN_SNR_DB:
                print(f"[gate] ignored: too faint to be you ({u['speech_db']:.0f} dB, the room is {u['noise_db']:.0f} dB)")
                self._set_state("listening")
                return "continue"
        # 2) not your voice? (TV, video, other people)
        if not self._is_owner(chunks):
            self._set_state("listening")
            return "continue"

        self._set_state("thinking")
        t0 = time.time()
        text = self.b.transcribe(self._to_wav(chunks))
        print(f"[time] speech-to-text {time.time() - t0:.1f}s")
        action, cleaned = self.gate(text, wake_seen, in_window)
        print(f"[stt] {text!r} -> {action}")
        if action == "ignore":
            self._set_state("listening")
            return "continue"
        if action == "ack":
            self.say(random.choice(ACKS))
            return "continue"
        if action == "end":
            self.say("Very good, sir.")
            return "end"
        self._turn(cleaned)
        return "continue"

    # ---------- a whole session ----------
    def run_session(self, trigger="hey_jarvis", live=False):
        self.active, self.live, self.stop_flag = True, live, False
        self.last_wake = self.now()
        self.need_reset = True
        self._set_state("listening")
        self.trigger.reset()
        self._emit(trigger="wake", via=trigger)
        if self.ui and OPEN_WINDOW_ON_WAKE:
            threading.Thread(target=self.ui.show_jarvis, daemon=True).start()

        try:
            # "Hey Jarvis, what's the time" in one breath -> answer, no briefing
            first = None
            if trigger != "live":
                first = self._listen(self.now() + DIRECT_COMMAND_WAIT)
            if first is not None:
                chunks, _ = first
                if self._handle_utterance(chunks, True, True) == "end":
                    return
            else:
                if trigger == "live":
                    self.say("I'm listening, sir.")
                elif self._should_brief():
                    self.say(self.b.briefing())
                    self.last_briefing = self.now()
                else:
                    self.say(random.choice(ACKS))

            window_until = self.now() + FOLLOW_UP_SEC
            while not self.stop_flag and not self.shutdown:
                got = self._listen(None if self.live else window_until)
                if got is None:
                    break                                   # window expired / stopped
                chunks, wake_seen = got
                in_window = self.now() <= window_until
                if self._handle_utterance(chunks, wake_seen, in_window) == "end":
                    break
                window_until = self.now() + FOLLOW_UP_SEC
        finally:
            self.active, self.live, self.stop_flag = False, False, False
            self._set_state("idle")
            self._emit(trigger="end")
            print("[jarvis] back to standby")

    # ---------- main loop ----------
    def run_forever(self):
        self._loop_thread = threading.get_ident()
        peak, loudest, last_print = 0.0, -120.0, self.now()
        near_best, near_time = 0.0, 0.0
        while not self.shutdown:
            try:
                req = self.requests.get_nowait()
            except queue.Empty:
                req = None
            if req:
                self.run_session(trigger=req["trigger"], live=req.get("live", False))
                continue

            chunk = self.mic.get(0.25)
            self._apply_reset()
            if chunk is None:
                if not self.mic.healthy() and not self.mic.muted:
                    print("[mic] no audio — restarting input stream")
                    try:
                        self.mic.restart()
                    except Exception as exc:
                        print(f"[mic] restart failed: {exc}")
                        self.sleep(2)
                continue
            self.recent.append(chunk)
            score = self._wake_score(chunk)
            if score < 0.05:
                self._track_noise(chunk)
            # "almost woke": tells you in the log that he HEARD something like his name
            if score >= 0.12:
                near_best, near_time = max(near_best, score), self.now()
            elif near_best and self.now() - near_time > 1.5:
                print(f"[wake] almost: best score {near_best:.2f} - he wakes at {WAKE_THRESHOLD} once, or {WAKE_SOFT} twice (try: calibrate_wake.py)")
                near_best = 0.0
            if DEBUG:
                peak = max(peak, score)
                rms = float(np.sqrt(np.mean(chunk.astype(np.float32) ** 2)))
                loudest = max(loudest, 20 * np.log10(max(rms, 1.0) / 32768))
                if self.now() - last_print >= 3:
                    print(f"[debug] standby - loudest {loudest:.0f} dB, best wake score {peak:.2f} (wakes at {WAKE_THRESHOLD}, or twice {WAKE_SOFT})")
                    peak, loudest, last_print = 0.0, -120.0, self.now()
            if self.trigger.update(score) and (self.now() - self.last_wake) > WAKE_COOLDOWN_SEC:
                print(f"[wake] hey jarvis (score {score:.2f})")
                near_best = 0.0
                self.run_session(trigger="hey_jarvis")

    # ---------- controls (hotkey / UI / tray) ----------
    def request_wake(self, live=False, trigger=None):
        self.requests.put({"trigger": trigger or ("live" if live else "api"), "live": live})

    def request_stop(self):
        self.stop_flag = True
        self.interrupt()

    def set_live(self, on):
        if on:
            if self.active:
                self.live = True
                self._emit(trigger="state")
            else:
                self.request_wake(live=True, trigger="live")
        else:
            self.live = False
            self._emit(trigger="state")
            if self.active:
                self.request_stop()

    def status(self):
        return {"state": self.state, "active": self.active, "live": self.live}

    def say_external(self, text):
        """Used by reminders / alerts. Waits its turn and mutes the mic correctly."""
        self.say(text)


# ============================================
# WIRING
# ============================================
def load_wake_model():
    import openwakeword
    from openwakeword.model import Model
    from openwakeword.vad import VAD

    paths = [p for p in openwakeword.get_pretrained_model_paths() if "hey_jarvis" in p]
    try:                                                    # openwakeword 0.4.x (pinned)
        model = Model(wakeword_model_paths=paths, vad_threshold=0.3)
    except TypeError:                                       # newer API, best effort
        try:
            openwakeword.utils.download_models(["hey_jarvis"])
        except Exception:
            pass
        model = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx", vad_threshold=0.3)
    return model, VAD()


def start_control_server(loop):
    from flask import Flask, jsonify, request
    from flask_cors import CORS

    app = Flask("jarvis-control")
    CORS(app, origins=UI_ORIGINS)

    @app.get("/status")
    def status():
        return jsonify(loop.status())

    @app.post("/wake")
    def wake():
        loop.request_wake(trigger="ui")
        return jsonify({"ok": True})

    @app.post("/live")
    def live():
        body = request.get_json(silent=True) or {}
        loop.set_live(bool(body.get("on")))
        return jsonify({"ok": True, **loop.status()})

    @app.post("/stop")
    def stop():
        loop.request_stop()
        return jsonify({"ok": True})

    @app.post("/say")
    def say():
        body = request.get_json(silent=True) or {}
        text = (body.get("text") or "").strip()
        if not text:
            return jsonify({"error": "no text"}), 400
        loop.say_external(text)
        return jsonify({"ok": True})

    app.run(host="127.0.0.1", port=CONTROL_PORT, threaded=True, use_reloader=False)


def setup_hotkey(loop):
    import keyboard

    def on_hotkey():
        if loop.state == "speaking":
            loop.interrupt()
        elif loop.active:
            loop.request_stop()
        else:
            loop.request_wake(trigger="hotkey")

    keyboard.add_hotkey(HOTKEY, on_hotkey)
    print(f"⌨️  Hotkey: {HOTKEY.upper()}")


def system_monitor(loop):
    import psutil

    while True:
        time.sleep(300)
        try:
            if loop.active:
                continue                       # never interrupt a conversation
            battery = psutil.sensors_battery()
            if battery and not battery.power_plugged:
                if battery.percent <= 15:
                    loop.say_external(f"Sir, your battery is critically low at {int(battery.percent)} percent. Please plug in your charger.")
                elif battery.percent <= 25:
                    loop.say_external(f"Sir, battery at {int(battery.percent)} percent. You may want to plug in soon.")
            cpu = psutil.cpu_percent(interval=1)
            if cpu > 90:
                loop.say_external(f"Sir, CPU usage is at {int(cpu)} percent. Your system is under heavy load.")
        except Exception as exc:
            print(f"[monitor] {exc}")


def main():
    import sounddevice as sd

    from ui_window import show_jarvis

    print("=" * 50)
    print("  J.A.R.V.I.S Voice Loop")
    print("=" * 50)
    print(sd.query_devices())
    print("(choose a microphone with:  set JARVIS_MIC=<number>)\n")

    model, vad = load_wake_model()
    mic = Mic(MIC_DEVICE)
    mic.start()
    try:
        info = sd.query_devices(mic.device, "input")
        print(f"🎤 Using microphone: {info['name']}  (gain x{MIC_GAIN})")
    except Exception:
        pass

    ui = SimpleNamespace(show_jarvis=show_jarvis)
    from speaker import SpeakerLock

    loop = VoiceLoop(Backends(), mic, model, vad, ui=ui, speaker=SpeakerLock.load())

    threading.Thread(target=start_control_server, args=(loop,), daemon=True).start()
    threading.Thread(target=system_monitor, args=(loop,), daemon=True).start()
    try:
        setup_hotkey(loop)
    except Exception as exc:
        print(f"[hotkey] unavailable: {exc}")

    print(f"✅ Say “Hey Jarvis” (wakes at {WAKE_THRESHOLD}, or twice at {WAKE_SOFT}; detect gain x{DETECT_GAIN}) or press {HOTKEY.upper()}\n")
    try:
        loop.run_forever()
    except KeyboardInterrupt:
        print("\n👋 Voice loop stopped")


if __name__ == "__main__":
    main()
