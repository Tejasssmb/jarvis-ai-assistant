import subprocess
import threading
import time
import os
import sys
import webbrowser
from PIL import Image, ImageDraw
import pystray

# ============================================
# CONFIGURATION
# ============================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.join(BASE_DIR, 'server')
CLIENT_DIR = os.path.join(BASE_DIR, 'client')
VOICE_DIR = os.path.join(BASE_DIR, 'voice-service')

# ============================================
# PROCESS HOLDERS
# ============================================
processes = {}

# ============================================
# START SERVICES
# ============================================
def start_server():
    print("🚀 Starting Node server...")
    processes['server'] = subprocess.Popen(
        ['node', 'index.js'],
        cwd=SERVER_DIR,
        creationflags=subprocess.CREATE_NO_WINDOW
    )
    print("✅ Server started (port 5000)")

def start_client():
    print("🚀 Starting React client...")
    processes['client'] = subprocess.Popen(
        ['npm', 'run', 'dev'],
        cwd=CLIENT_DIR,
        creationflags=subprocess.CREATE_NO_WINDOW,
        shell=True
    )
    print("✅ Client started (port 5173)")

def start_voice_service():
    print("🚀 Starting voice service...")
    processes['voice'] = subprocess.Popen(
        ['python', 'app.py'],
        cwd=VOICE_DIR,
        creationflags=subprocess.CREATE_NO_WINDOW
    )
    print("✅ Voice service started (port 5001)")

def start_wake_service():
    print("🚀 Starting wake service...")
    time.sleep(3)  # Wait for other services to start
    processes['wake'] = subprocess.Popen(
        ['python', 'wake.py'],
        cwd=VOICE_DIR,
        creationflags=subprocess.CREATE_NO_WINDOW
    )
    print("✅ Wake service started")

def start_all_services():
    threads = [
        threading.Thread(target=start_server, daemon=True),
        threading.Thread(target=start_client, daemon=True),
        threading.Thread(target=start_voice_service, daemon=True),
        threading.Thread(target=start_wake_service, daemon=True),
    ]
    for t in threads:
        t.start()

# ============================================
# STOP ALL SERVICES
# ============================================
def stop_all_services():
    print("🛑 Stopping all services...")
    for name, process in processes.items():
        try:
            process.terminate()
            print(f"✅ {name} stopped")
        except:
            pass

# ============================================
# CREATE TRAY ICON
# ============================================
def create_icon_image():
    # Create a simple J icon
    img = Image.new('RGB', (64, 64), color='#0a0a0f')
    draw = ImageDraw.Draw(img)
    draw.ellipse([4, 4, 60, 60], fill='#00d4ff')
    draw.text((20, 15), 'J', fill='#000000')
    return img

def open_dashboard(icon, item):
    time.sleep(2)  # Wait for client to be ready
    webbrowser.open('http://localhost:5173')

def restart_jarvis(icon, item):
    stop_all_services()
    time.sleep(2)
    start_all_services()

def exit_jarvis(icon, item):
    stop_all_services()
    icon.stop()
    sys.exit(0)

def setup_tray():
    image = create_icon_image()
    menu = pystray.Menu(
        pystray.MenuItem('● Jarvis is Running', None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Open Dashboard', open_dashboard),
        pystray.MenuItem('Restart Jarvis', restart_jarvis),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Exit Jarvis', exit_jarvis),
    )
    icon = pystray.Icon('Jarvis', image, 'J.A.R.V.I.S', menu)
    return icon

# ============================================
# MAIN
# ============================================
if __name__ == '__main__':
    print("=" * 50)
    print("  J.A.R.V.I.S — Starting up...")
    print("=" * 50)

    # Start all services
    start_all_services()

    # Wait a bit then open browser
    time.sleep(5)
    webbrowser.open('http://localhost:5173')

    print("\n✅ All services starting!")
    print("📌 Jarvis icon added to system tray")
    print("Right click tray icon to control Jarvis\n")

    # Start system tray (blocks until exit)
    icon = setup_tray()
    icon.run()