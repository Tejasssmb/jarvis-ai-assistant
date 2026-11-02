"""
jarvis_launcher.py — starts every Jarvis service and a system-tray icon.

    python jarvis_launcher.py               start everything and open the Jarvis window
    python jarvis_launcher.py --background  start everything silently (use this at Windows
                                            login); say "Hey Jarvis" and the reactor
                                            window appears by itself.

Needs:  pip install pystray pillow requests
Logs:   <project>/logs/<service>.log   (look here when something does not start)
"""
import argparse
import os
import socket
import subprocess
import sys
import threading
import time

import requests
from PIL import Image, ImageDraw
import pystray

# ============================================
# CONFIGURATION
# ============================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(BASE_DIR, 'server')
CLIENT_DIR = os.path.join(BASE_DIR, 'client')
VOICE_DIR = os.path.join(BASE_DIR, 'voice-service')
LOG_DIR = os.path.join(BASE_DIR, 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

# python.exe (not pythonw.exe) so child services can write to their log files
PYTHON = sys.executable.replace('pythonw.exe', 'python.exe')
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
# Child services write to log files: make Python use UTF-8 there (emoji would crash cp1252)
CHILD_ENV = {**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'}

sys.path.insert(0, VOICE_DIR)
from ui_window import show_jarvis  # noqa: E402  (focus or launch the Jarvis window)

processes = {}
stop_event = threading.Event()
OVERLAY_ENABLED = os.getenv('JARVIS_OVERLAY') != '0'


# ============================================
# HELPERS
# ============================================
def port_open(port):
    # Vite listens on "localhost", which on Windows is often IPv6 (::1) only.
    # create_connection tries IPv6 AND IPv4, so both kinds of service are found.
    try:
        with socket.create_connection(('localhost', port), timeout=0.5):
            return True
    except OSError:
        return False


def wait_for_url(url, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        try:
            requests.get(url, timeout=2)      # any HTTP answer = the service is up
            return True
        except Exception:
            time.sleep(1)
    return False


def kill_tree(process):
    """terminate() leaves node/vite children running on Windows; taskkill /T gets them all."""
    try:
        subprocess.run(
            ['taskkill', '/PID', str(process.pid), '/T', '/F'],
            capture_output=True, creationflags=NO_WINDOW,
        )
    except Exception:
        pass


def start(name, cmd, cwd, port=None, shell=False, delay=0):
    if delay:
        time.sleep(delay)
    if port and port_open(port):
        print(f"↪️  {name}: port {port} already in use — assuming it is already running")
        return
    log = open(os.path.join(LOG_DIR, f'{name}.log'), 'a', buffering=1, encoding='utf-8')
    print(f"🚀 Starting {name}...")
    processes[name] = subprocess.Popen(
        cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
        creationflags=NO_WINDOW, shell=shell, env=CHILD_ENV,
    )


def start_all_services():
    jobs = [
        ('server', ['node', 'index.js'], SERVER_DIR, 5000, False, 0),
        ('client', 'npm run dev', CLIENT_DIR, 5173, True, 0),
        ('voice', [PYTHON, '-u', 'app.py'], VOICE_DIR, 5001, False, 0),
        ('wake', [PYTHON, '-u', 'wake.py'], VOICE_DIR, 5002, False, 4),   # after the others
    ]
    if OVERLAY_ENABLED:
        # the little corner reactor shown while Jarvis is awake
        jobs.append(('overlay', [PYTHON, '-u', 'overlay.py'], VOICE_DIR, 5003, False, 6))
    for name, cmd, cwd, port, shell, delay in jobs:
        threading.Thread(
            target=start, args=(name, cmd, cwd, port, shell, delay), daemon=True
        ).start()


def stop_all_services():
    print("🛑 Stopping all services...")
    for name, process in list(processes.items()):
        kill_tree(process)
        print(f"✅ {name} stopped")
    processes.clear()


# ============================================
# TRAY ICON
# ============================================
def create_icon_image():
    img = Image.new('RGB', (64, 64), color='#0a0a0f')
    draw = ImageDraw.Draw(img)
    draw.ellipse([4, 4, 60, 60], fill='#4f8fe0')
    draw.text((26, 24), 'J', fill='#000000')
    return img


def open_jarvis(icon=None, item=None):
    threading.Thread(target=show_jarvis, daemon=True).start()


def wake_jarvis(icon=None, item=None):
    try:
        requests.post('http://127.0.0.1:5002/wake', timeout=3)
    except Exception:
        print("Voice loop is not running yet.")


def restart_jarvis(icon, item):
    stop_all_services()
    time.sleep(2)
    start_all_services()


def exit_jarvis(icon, item):
    stop_all_services()
    stop_event.set()
    icon.stop()


def setup_tray():
    menu = pystray.Menu(
        pystray.MenuItem('● Jarvis is running', None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Open Jarvis', open_jarvis, default=True),
        pystray.MenuItem('Wake Jarvis', wake_jarvis),
        pystray.MenuItem('Restart Jarvis', restart_jarvis),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Exit Jarvis', exit_jarvis),
    )
    return pystray.Icon('Jarvis', create_icon_image(), 'J.A.R.V.I.S', menu)


# (name, port, seconds to wait) — the server needs the longest (database connection)
HEALTH_CHECKS = [
    ('server', 5000, 120),
    ('client', 5173, 90),
    ('voice', 5001, 90),
    ('wake', 5002, 120),          # loads an AI model first
]
if OVERLAY_ENABLED:
    HEALTH_CHECKS.append(('overlay', 5003, 60))


def tail(path, lines=15):
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            return ''.join(f.readlines()[-lines:])
    except Exception:
        return '(no log yet)'


def report_health():
    """Checks every service at the same time and prints each result as soon as it is known."""
    lock = threading.Lock()

    def crashed(name):
        proc = processes.get(name)
        return proc is not None and proc.poll() is not None

    def alive(name, port):
        proc = processes.get(name)
        if name == 'overlay':                       # no web port worth trusting: is the process alive?
            return proc is not None and proc.poll() is None
        return port_open(port)

    def check(name, port, timeout):
        end = time.time() + timeout
        while time.time() < end and not alive(name, port) and not crashed(name):
            time.sleep(1)
        if name == 'overlay' and alive(name, port):
            time.sleep(3)                           # still alive a few seconds later = started fine
        up = alive(name, port)
        with lock:
            if up:
                print(f"✅ {name:<8} is running")
            elif crashed(name):
                print(f"❌ {name:<8} CRASHED right after starting. Last lines of logs\\{name}.log:")
                print(tail(os.path.join(LOG_DIR, f'{name}.log')))
            else:
                print(f"❌ {name:<8} did NOT start within {timeout}s. Last lines of logs\\{name}.log:")
                print(tail(os.path.join(LOG_DIR, f'{name}.log')))

    workers = [threading.Thread(target=check, args=c, daemon=True) for c in HEALTH_CHECKS]
    for w in workers:
        w.start()
    for w in workers:
        w.join()
    print("\n(Health check finished. Press Ctrl+C here, or use the tray icon, to stop Jarvis.)\n")


def open_window_when_ready():
    wait_for_url('http://localhost:5173')
    wait_for_url('http://localhost:5000/api/startup')   # Node server + database
    show_jarvis()
    # No greeting here: Jarvis speaks the startup briefing when you say "Hey Jarvis".


# ============================================
# MAIN
# ============================================
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--background', action='store_true',
                        help='start silently; the window opens when you say "Hey Jarvis"')
    args = parser.parse_args()

    print("=" * 50)
    print("  J.A.R.V.I.S — Starting up...")
    print("=" * 50)

    start_all_services()

    if not args.background:
        threading.Thread(target=open_window_when_ready, daemon=True).start()

    print("\n⏳ Services starting — logs are in the 'logs' folder")
    print('🎙️  Say "Hey Jarvis" from anywhere\n')
    threading.Thread(target=report_health, daemon=True).start()

    icon = setup_tray()
    icon.run_detached()     # tray runs in its own thread, so Ctrl+C still works here
    try:
        while not stop_event.is_set():
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n🛑 Ctrl+C — stopping Jarvis...")
    finally:
        stop_all_services()
        try:
            icon.stop()
        except Exception:
            pass
