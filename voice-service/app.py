from flask import Flask, request, jsonify
import edge_tts
import asyncio
import pygame
import re
import threading
import subprocess
import psutil
import os
import time
import glob
from ddgs import DDGS
import sys
import traceback

app = Flask(__name__)
VOICE = "en-US-GuyNeural"

pygame.mixer.init()
speaking_lock = threading.Lock()

# ============================================
# APP PATHS
# ============================================
USERNAME = os.getenv('USERNAME')
APP_PATHS = {
    'chrome': r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'vscode': rf'C:\Users\{USERNAME}\AppData\Local\Programs\Microsoft VS Code\Code.exe',
    'notepad': 'notepad.exe',
    'calculator': 'calc.exe',
    'explorer': 'explorer.exe',
    'spotify': rf'C:\Users\{USERNAME}\AppData\Roaming\Spotify\Spotify.exe',
    'whatsapp': rf'C:\Users\{USERNAME}\AppData\Local\WhatsApp\WhatsApp.exe',
    'excel': r'C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE',
    'word': r'C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE',
    'powerpoint': r'C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE',
    'vlc': r'C:\Program Files\VideoLAN\VLC\vlc.exe',
    'zoom': rf'C:\Users\{USERNAME}\AppData\Roaming\Zoom\bin\Zoom.exe',
    'telegram': rf'C:\Users\{USERNAME}\AppData\Roaming\Telegram Desktop\Telegram.exe',
}

FOLDER_PATHS = {
    'desktop': rf'C:\Users\{USERNAME}\Desktop',
    'downloads': rf'C:\Users\{USERNAME}\Downloads',
    'documents': rf'C:\Users\{USERNAME}\Documents',
    'pictures': rf'C:\Users\{USERNAME}\Pictures',
    'music': rf'C:\Users\{USERNAME}\Music',
    'videos': rf'C:\Users\{USERNAME}\Videos',
}

WEBSITES = {
    'youtube': 'https://youtube.com',
    'google': 'https://google.com',
    'github': 'https://github.com',
    'gmail': 'https://gmail.com',
    'instagram': 'https://instagram.com',
    'whatsapp web': 'https://web.whatsapp.com',
    'netflix': 'https://netflix.com',
    'twitter': 'https://twitter.com',
    'linkedin': 'https://linkedin.com',
    'chatgpt': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
}

# ============================================
# HELPER FUNCTIONS
# ============================================
def clean_text_for_speech(text):
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'#+\s*', '', text)
    text = re.sub(r'`(.*?)`', r'\1', text)
    text = re.sub(r'^[-•]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n+', '. ', text)
    text = re.sub(r'/', ' or ', text)
    return text.strip()

async def generate_speech(text, audio_file):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(audio_file)

def play_audio(audio_file):
    with speaking_lock:
        pygame.mixer.music.stop()
        pygame.mixer.music.unload()
        pygame.mixer.music.load(audio_file)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
        pygame.mixer.music.unload()
        try:
            os.remove(audio_file)
        except:
            pass

def find_file(filename):
    search_dirs = [
        rf'C:\Users\{USERNAME}\Desktop',
        rf'C:\Users\{USERNAME}\Downloads',
        rf'C:\Users\{USERNAME}\Documents',
        rf'C:\Users\{USERNAME}\Pictures',
        rf'C:\Users\{USERNAME}\Videos',
        rf'C:\Users\{USERNAME}\Music',
        rf'C:\Users\{USERNAME}',
    ]
    filename_lower = filename.lower()
    for directory in search_dirs:
        if os.path.exists(directory):
            for root, dirs, files in os.walk(directory):
                for file in files:
                    if filename_lower in file.lower():
                        return os.path.join(root, file)
    return None

def change_wallpaper(image_path):
    import ctypes
    ctypes.windll.user32.SystemParametersInfoW(20, 0, image_path, 3)

# ============================================
# ROUTES
# ============================================

@app.route('/speak', methods=['POST'])
def speak():
    data = request.json
    text = data.get('text', '')
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    try:
        clean_text = clean_text_for_speech(text)
        audio_file = f"response_{int(time.time())}.mp3"
        asyncio.run(generate_speech(clean_text, audio_file))
        play_audio(audio_file)
        return jsonify({'status': 'done'})
    except Exception as e:
        print("=== VOICE SERVICE ERROR ===")
        print(str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/stop', methods=['POST'])
def stop():
    pygame.mixer.music.stop()
    return jsonify({'status': 'stopped'})

@app.route('/search', methods=['POST'])
def search():
    data = request.json
    query = data.get('query', '')
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    try:
        results = DDGS().text(query, max_results=4)
        cleaned = [{'title': r['title'], 'body': r['body']} for r in results]
        return jsonify({'results': cleaned})
    except Exception as e:
        print("=== SEARCH ERROR ===")
        print(str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/execute', methods=['POST'])
def execute():
    data = request.json
    parsed = data.get('parsed', {})
    action = parsed.get('action', '')
    target = parsed.get('target', '').lower().strip()
    query = parsed.get('query', '')

    try:
        # Open App
        if action == 'open_app':
            if target in APP_PATHS:
                try:
                    subprocess.Popen([APP_PATHS[target]])
                except Exception:
                    subprocess.Popen(f'start {target}', shell=True)
            else:
                subprocess.Popen(f'start {target}', shell=True)
            return jsonify({'status': 'success', 'action': f'Opening {target} for you sir'})

        # Open Folder
        elif action == 'open_folder':
            if target in FOLDER_PATHS:
                subprocess.Popen(['explorer', FOLDER_PATHS[target]])
            else:
                subprocess.Popen(['explorer', rf'C:\Users\{USERNAME}\{target.capitalize()}'])
            return jsonify({'status': 'success', 'action': f'Opening your {target} folder'})

        # Open Website
        elif action == 'open_website':
            if target in WEBSITES:
                url = WEBSITES[target]
            else:
                target_clean = target.strip().replace(' ', '')
                if '.' in target_clean:
                    url = f'https://{target_clean}'
                else:
                    url = f'https://{target_clean}.com'
            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({'status': 'success', 'action': f'Opening {target} for you'})

        # YouTube Search
        elif action == 'youtube_search':
            url = f'https://youtube.com/results?search_query={query.replace(" ", "+")}'
            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({'status': 'success', 'action': f'Searching YouTube for {query}'})

        # Google Search
        elif action == 'google_search':
            url = f'https://google.com/search?q={query.replace(" ", "+")}'
            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({'status': 'success', 'action': f'Searching Google for {query}'})

        # Open File
        elif action == 'open_file':
            found = find_file(query)
            if found:
                os.startfile(found)
                return jsonify({'status': 'success', 'action': f'Opening {os.path.basename(found)}'})
            else:
                return jsonify({'status': 'failed', 'action': f'Sorry, I could not find {query} on your laptop'})

        # Screenshot
        elif action == 'screenshot':
            import pyautogui
            path = rf'C:\Users\{USERNAME}\Desktop\jarvis_screenshot_{int(time.time())}.png'
            pyautogui.screenshot(path)
            return jsonify({'status': 'success', 'action': 'Screenshot saved to your Desktop'})

        # Battery
        elif action == 'battery':
            battery = psutil.sensors_battery()
            if battery:
                percent = battery.percent
                plugged = "plugged in" if battery.power_plugged else "running on battery"
                return jsonify({'status': 'success', 'action': f'Battery is at {percent}% and {plugged}'})
            return jsonify({'status': 'failed', 'action': 'Could not read battery status'})

        # Volume
        elif action == 'volume_up':
            for _ in range(5):
                subprocess.run(['powershell', '-c',
                                '(New-Object -com WScript.Shell).SendKeys([char]175)'])
            return jsonify({'status': 'success', 'action': 'Volume increased'})

        elif action == 'volume_down':
            for _ in range(5):
                subprocess.run(['powershell', '-c',
                                '(New-Object -com WScript.Shell).SendKeys([char]174)'])
            return jsonify({'status': 'success', 'action': 'Volume decreased'})

        elif action == 'mute':
            subprocess.run(['powershell', '-c',
                            '(New-Object -com WScript.Shell).SendKeys([char]173)'])
            return jsonify({'status': 'success', 'action': 'Muted'})

        # Wallpaper
        elif action == 'wallpaper':
            pictures_path = rf'C:\Users\{USERNAME}\Pictures'
            images = glob.glob(os.path.join(pictures_path, '*.jpg')) + \
                     glob.glob(os.path.join(pictures_path, '*.png'))
            if images:
                change_wallpaper(images[0])
                return jsonify({'status': 'success', 'action': 'Wallpaper changed'})
            else:
                return jsonify({'status': 'failed', 'action': 'No images found in Pictures folder'})

        # Settings
        elif action == 'wifi_settings':
            subprocess.Popen('start ms-settings:network-wifi', shell=True)
            return jsonify({'status': 'success', 'action': 'Opening WiFi settings'})

        elif action == 'bluetooth_settings':
            subprocess.Popen('start ms-settings:bluetooth', shell=True)
            return jsonify({'status': 'success', 'action': 'Opening Bluetooth settings'})

        elif action == 'display_settings':
            subprocess.Popen('start ms-settings:display', shell=True)
            return jsonify({'status': 'success', 'action': 'Opening Display settings'})

        elif action == 'task_manager':
            subprocess.Popen('taskmgr.exe')
            return jsonify({'status': 'success', 'action': 'Opening Task Manager'})

        # Power
        elif action == 'shutdown':
            subprocess.run(['shutdown', '/s', '/t', '10'])
            return jsonify({'status': 'success', 'action': 'Shutting down in 10 seconds'})

        elif action == 'restart':
            subprocess.run(['shutdown', '/r', '/t', '10'])
            return jsonify({'status': 'success', 'action': 'Restarting in 10 seconds'})

        elif action == 'sleep':
            subprocess.run(['powershell', '-c',
                            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)'])
            return jsonify({'status': 'success', 'action': 'Going to sleep'})

        return jsonify({'status': 'unknown', 'action': 'Command not recognized'})

    except Exception as e:
        print(f"=== EXECUTE ERROR ===")
        print(str(e))
        return jsonify({'error': str(e)}), 500
    # Safe modules Groq is allowed to use
ALLOWED_MODULES = [
    'pyautogui', 'subprocess', 'os', 'time', 
    'psutil', 'glob', 'ctypes', 'winreg',
    'shutil', 'pathlib', 'webbrowser'
]

# Dangerous keywords never allowed in dynamic code
BLOCKED_KEYWORDS = [
    'rmdir', 'remove', 'unlink', 'format', 
    'del ', 'shutil.rmtree', 'os.remove',
    'os.rmdir', 'sys.exit', '__import__',
    'exec(', 'eval(', 'compile('
]

@app.route('/dynamic', methods=['POST'])
def dynamic_execute():
    data = request.json
    code = data.get('code', '')
    description = data.get('description', '')

    if not code:
        return jsonify({'error': 'No code provided'}), 400

    # Safety check — block dangerous operations
    code_lower = code.lower()
    for blocked in BLOCKED_KEYWORDS:
        if blocked.lower() in code_lower:
            print(f"=== BLOCKED DANGEROUS CODE: {blocked} ===")
            return jsonify({
                'status': 'blocked',
                'action': f'I blocked that command for safety reasons'
            }), 403

    print(f"=== EXECUTING DYNAMIC CODE ===")
    print(f"Description: {description}")
    print(f"Code: {code}")
    print("==============================")

    try:
        # Execute in restricted environment
        exec_globals = {
            '__builtins__': {
                'print': print,
                'range': range,
                'len': len,
                'str': str,
                'int': int,
                'float': float,
                'bool': bool,
                'list': list,
                'dict': dict,
                'tuple': tuple,
                'enumerate': enumerate,
                'zip': zip,
                'map': map,
                'filter': filter,
                '__import__': __import__
            }
        }
        exec(code, exec_globals)
        return jsonify({
            'status': 'success',
            'action': description or 'Done sir'
        })
    except Exception as e:
        print(f"Dynamic execution error: {e}")
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'action': f'Could not execute that command: {str(e)}'
        }), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)