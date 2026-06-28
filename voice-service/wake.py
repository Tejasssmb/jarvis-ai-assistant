import sounddevice as sd
import numpy as np
import requests
import threading
import time
import io
import wave
import pyaudio
import keyboard

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
def record_command(duration=5):
    print("🎤 Recording your command...")
    p = pyaudio.PyAudio()
    stream = p.open(
        format=pyaudio.paInt16,
        channels=1,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=1024
    )
    frames = []
    for _ in range(0, int(SAMPLE_RATE / 1024 * duration)):
        data = stream.read(1024, exception_on_overflow=False)
        frames.append(data)
    stream.stop_stream()
    stream.close()
    p.terminate()

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
            timeout=10
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
    speak("Yes sir, I'm listening")

    audio_buffer = record_command(duration=5)
    text = transcribe(audio_buffer)

    if text and len(text) > 2:
        notify_ui('message', message=text)
        reply = get_response(text)
        if reply:
            notify_ui('reply', reply=reply)
    else:
        speak("Sorry sir, I didn't catch that. Please try again.")

    print("👂 Ready. Press Ctrl+Space or double clap...")
    time.sleep(1)
    is_activated = False

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

# ============================================
# MAIN
# ============================================
if __name__ == '__main__':
    print("=" * 50)
    print("  J.A.R.V.I.S Wake Service v3")
    print("=" * 50)

    # Setup keyboard shortcut
    setup_hotkey()

    # Start clap detection in background
    clap_thread = threading.Thread(
        target=start_clap_detection,
        daemon=True
    )
    clap_thread.start()

    print("\n✅ Jarvis is ready!")
    print(f"⌨️  Press {HOTKEY.upper()} to activate")
    print("👏 Or double clap loudly to activate")
    print("\nPress Ctrl+C to stop\n")

    try:
        keyboard.wait()
    except KeyboardInterrupt:
        print("\n👋 Wake service stopped")