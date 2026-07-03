import sounddevice as sd
import numpy as np
import requests
import threading
import time
import io
import wave
import pyaudio
import keyboard
from datetime import datetime
# ============================================
# CONFIGURATION
# ============================================
SAMPLE_RATE = 16000
CLAP_THRESHOLD = 0.25      # High threshold — only loud intentional claps
CLAP_WINDOW = 1.5
HOTKEY = 'ctrl+space'      # Keyboard shortcut to activate Jarvis
SERVER_URL = 'http://localhost:5000/api/chat'
SPEAK_URL = 'http://127.0.0.1:5001/speak'
WAKE_URL = 'http://localhost:5000/api/chat/wake'

# ============================================
# STATE
# ============================================
last_clap_time = 0
clap_count = 0
is_activated = False
noise_floor = []

# ============================================
# SPEAK
# ============================================
def speak(text):
    try:
        requests.post(SPEAK_URL, json={'text': text}, timeout=30)
    except Exception as e:
        print(f"Speak error: {e}")

# ============================================
# NOTIFY BROWSER UI
# ============================================
def notify_ui(trigger, message='', reply=''):
    try:
        requests.post(WAKE_URL, json={
            'trigger': trigger,
            'message': message,
            'reply': reply
        }, timeout=3)
    except:
        pass

# ============================================
# RECORD COMMAND
# ============================================
def record_command(duration=7):
    print("🎤 Recording your command... (speak now)")
    p = pyaudio.PyAudio()
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=1024
    )
    frames = []
    silent_chunks = 0
    speaking_started = False
    MAX_SILENT_CHUNKS = 20  # ~1.3 sec silence after speech ends
    MIN_SPEECH_CHUNKS = 8   # Must detect at least ~0.5 sec of real speech

    total_chunks = int(SAMPLE_RATE / 1024 * duration)

    for _ in range(total_chunks):
        data = stream.read(1024, exception_on_overflow=False)
        frames.append(data)

        audio_data = np.frombuffer(data, dtype=np.int16)
        volume = np.max(np.abs(audio_data)) / 32768.0

        if volume > 0.04:
            speaking_started = True
            silent_chunks = 0
        elif speaking_started:
            silent_chunks += 1
            if silent_chunks > MAX_SILENT_CHUNKS:
                print("🔇 Speech ended, processing...")
                break

    stream.stop_stream()
    stream.close()
    p.terminate()

    # Count actual speech chunks
    speech_chunks = sum(
        1 for f in frames
        if np.max(np.abs(np.frombuffer(f, dtype=np.int16))) / 32768.0 > 0.04
    )

    print(f"Speech chunks detected: {speech_chunks}")

    # Not enough real speech — don't send to Whisper
    if speech_chunks < MIN_SPEECH_CHUNKS:
        print("⚠️ Not enough speech detected, ignoring...")
        return None

    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(b''.join(frames))
    wav_buffer.seek(0)
    return wav_buffer
# ============================================
# TRANSCRIBE
# ============================================
def transcribe(audio_buffer):
    try:
        files = {'audio': ('command.wav', audio_buffer, 'audio/wav')}
        res = requests.post(
            f'{SERVER_URL}/transcribe',
            files=files,
            timeout=30
        )
        if res.status_code == 200:
            text = res.json().get('text', '').strip()
            print(f"📝 You said: {text}")
            return text
        return ''
    except Exception as e:
        print(f"Transcription error: {e}")
        return ''

# ============================================
# GET AI RESPONSE
# ============================================
def get_response(text):
    try:
        res = requests.post(
            SERVER_URL,
            json={'message': text, 'history': []},
            timeout=15
        )
        if res.status_code == 200:
            reply = res.json().get('reply', '')
            print(f"🤖 Jarvis: {reply}")
            return reply
        return ''
    except Exception as e:
        print(f"Response error: {e}")
        return ''

# ============================================
# HANDLE ACTIVATION
# ============================================
def handle_activation(trigger_type):
    global is_activated
    if is_activated:
        return
    is_activated = True

    print(f"\n🟢 JARVIS ACTIVATED via {trigger_type}!")
    notify_ui(trigger_type)
    speak("Yes sir")

    # Wait for "Yes sir" to fully finish playing before recording,
    # so the mic doesn't pick up Jarvis's own voice
    time.sleep(0.3)

    audio_buffer = record_command(duration=6)
    if audio_buffer is None:
        speak("I didn't catch that sir, please try again.")
        is_activated = False
        print("👂 Back to standby. Press Ctrl+Space to activate.")
        return

    text = transcribe(audio_buffer)

    if not text or len(text.strip()) < 3:
        print("👂 No clear input detected.")
        is_activated = False
        print("👂 Back to standby. Press Ctrl+Space to activate.")
        return

    notify_ui('message', message=text)
    reply = get_response(text)

    if reply:
        notify_ui('reply', reply=reply)

    # Wait for TTS to finish before releasing
    # Estimate speak time based on word count
    word_count = len(reply.split())
    estimated_speak_time = max(2.0, word_count * 0.4)
    time.sleep(estimated_speak_time)
    is_activated = False
    print("👂 Back to standby. Press Ctrl+Space to activate.")
# ============================================
# KEYBOARD SHORTCUT
# ============================================
def setup_hotkey():
    print(f"⌨️  Hotkey activated: {HOTKEY.upper()}")
    keyboard.add_hotkey(HOTKEY, lambda: threading.Thread(
        target=handle_activation,
        args=('keyboard_shortcut',),
        daemon=True
    ).start())

# ============================================
# CLAP DETECTION
# ============================================
def audio_callback(indata, frames, time_info, status):
    global last_clap_time, clap_count, noise_floor

    volume = np.max(np.abs(indata))
    current_time = time.time()

    noise_floor.append(volume)
    if len(noise_floor) > 50:
        noise_floor.pop(0)

    avg_noise = np.mean(noise_floor) if noise_floor else 0
    dynamic_threshold = max(CLAP_THRESHOLD, avg_noise * 3)

    if volume > dynamic_threshold:
        time_since_last = current_time - last_clap_time

        if time_since_last > 0.15:
            if 0.15 < time_since_last < CLAP_WINDOW:
                clap_count += 1
                print(f"👏 Clap {clap_count}! (vol:{volume:.3f})")
                if clap_count >= 2:
                    clap_count = 0
                    threading.Thread(
                        target=handle_activation,
                        args=('double_clap',),
                        daemon=True
                    ).start()
            else:
                clap_count = 1
                print(f"👏 Clap 1! (vol:{volume:.3f})")
            last_clap_time = current_time

def start_clap_detection():
    print("👏 Clap detection started (loud claps only)...")
    with sd.InputStream(
        callback=audio_callback,
        channels=1,
        samplerate=44100,
        blocksize=1024
    ):
        while True:
            time.sleep(0.1)
def system_monitor():
    while True:
        try:
            time.sleep(300)  # Check every 5 minutes
            
            # Battery check
            import psutil
            battery = psutil.sensors_battery()
            if battery and not battery.power_plugged:
                if battery.percent <= 15:
                    speak(f"Sir, your battery is critically low at {int(battery.percent)}%. Please plug in your charger immediately.")
                elif battery.percent <= 25:
                    speak(f"Sir, battery at {int(battery.percent)}%. You may want to plug in soon.")
            
            # CPU check
            cpu = psutil.cpu_percent(interval=1)
            if cpu > 90:
                speak(f"Sir, CPU usage is at {int(cpu)}%. Your system is under heavy load.")

        except Exception as e:
            print(f"Monitor error: {e}")

# Add this to main, before keyboard.wait()
monitor_thread = threading.Thread(target=system_monitor, daemon=True)
monitor_thread.start()
print("📊 System monitoring active")
morning_briefed = False

def morning_briefing():
    global morning_briefed
    while True:
        try:
            now = datetime.now() if 'datetime' in dir() else __import__('datetime').datetime.now()
            # Give morning briefing between 6 AM and 11 AM, once per day
            if 6 <= now.hour <= 11 and not morning_briefed:
                morning_briefed = True
                time.sleep(10)  # Wait for all services
                
                hour = now.hour
                if hour < 12:
                    greeting = "Good morning"
                
                briefing = f"{greeting} sir. It's {now.strftime('%A, %B %d')}. All Jarvis systems are running normally. I'm ready to assist you whenever you need me."
                speak(briefing)
            
            # Reset at midnight
            if now.hour == 0:
                morning_briefed = False
                
            time.sleep(60)  # Check every minute
        except Exception as e:
            print(f"Briefing error: {e}")
            time.sleep(60)

# ============================================
# MAIN
# ============================================
if __name__ == '__main__':
    print("=" * 50)
    print("  J.A.R.V.I.S Wake Service v3")
    print("=" * 50)

    # Setup keyboard shortcut
    setup_hotkey()

    # Start clap detection
    clap_thread = threading.Thread(target=start_clap_detection, daemon=True)
    clap_thread.start()

    # Start system monitoring
    monitor_thread = threading.Thread(target=system_monitor, daemon=True)
    monitor_thread.start()
    print("📊 System monitoring active")

    # Start morning briefing
    briefing_thread = threading.Thread(target=morning_briefing, daemon=True)
    briefing_thread.start()
    print("🌅 Morning briefing active")

    print("\n✅ Jarvis is ready!")
    print(f"⌨️  Press {HOTKEY.upper()} to activate")
    print("👏 Or double clap loudly to activate")
    print("📊 System monitoring every 5 minutes")
    print("\nPress Ctrl+C to stop\n")

    try:
        keyboard.wait()
    except KeyboardInterrupt:
        print("\n👋 Wake service stopped")