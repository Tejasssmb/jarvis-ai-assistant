from datetime import datetime

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
import io
import speedtest
import GPUtil
import wmi
import requests
import shutil
from tools.screenshot_tools import take_screenshot
from tools.system_tools import get_battery
from tools.media_tools import (
    volume_up,
    volume_down,
    mute
)
from tools.clipboard_tools import (
    read_clipboard,
    write_clipboard
)
from tools.system_tools import (
    get_battery,
    get_cpu_usage,
    get_ram_usage,
    get_disk_usage,
    get_network_status,
    get_ip_address
)
from tools.brightness_tools import (
    get_brightness,
    set_brightness,
    increase_brightness,
    decrease_brightness
)
from contextlib import redirect_stdout
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
    'gmail': 'https://mail.google.com',
    'instagram': 'https://instagram.com',
    'whatsapp': 'https://web.whatsapp.com',
    'whatsapp web': 'https://web.whatsapp.com',
    'netflix': 'https://netflix.com',
    'twitter': 'https://twitter.com',
    'linkedin': 'https://linkedin.com',
    'chatgpt': 'https://chat.openai.com',
    'claude': 'https://claude.ai',
    'amazon': 'https://amazon.in',
    'flipkart': 'https://flipkart.com',
    'hotstar': 'https://hotstar.com',
    'reddit': 'https://reddit.com',
    'facebook': 'https://facebook.com',
}
TOOLS = {
    "battery": get_battery,
    "cpu": get_cpu_usage,
    "ram": get_ram_usage,
    "disk": get_disk_usage,
    "network": get_network_status,
    "ip_address": get_ip_address,
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

    exact_match = None
    partial_match = None

    for directory in search_dirs:
        if os.path.exists(directory):
            for root, dirs, files in os.walk(directory):

                # Skip huge junk folders
                dirs[:] = [
                    d for d in dirs
                    if d.lower() not in [
                        "node_modules",
                        ".git",
                        "__pycache__",
                        "venv"
                    ]
                ]

                for file in files:

                    file_lower = file.lower()

                    if file_lower == filename_lower:
                        return os.path.join(root, file)

                    if filename_lower in file_lower and partial_match is None:
                        partial_match = os.path.join(root, file)

    return partial_match

def change_wallpaper(image_path):
    import ctypes
    ctypes.windll.user32.SystemParametersInfoW(20, 0, image_path, 3)

import psutil

def get_running_apps():
    apps = []

    for proc in psutil.process_iter(['pid', 'name']):
        try:
            name = proc.info['name']
            if name:
                apps.append(name)
        except:
            pass

    apps = sorted(list(set(apps)))

    return {
        "status": "success",
        "action": f"Running apps: {', '.join(apps[:20])}"
    }

def kill_app(app_name):
    killed = False

    for proc in psutil.process_iter(['pid', 'name']):
        try:
            if app_name.lower() in proc.info['name'].lower():
                proc.kill()
                killed = True
        except:
            pass

    if killed:
        return {
            "status": "success",
            "action": "closed_app"
        }

    return {
        "status": "failed",
        "action": f"{app_name} is not running"
    }

def create_folder(folder_name):
    try:
        path = os.path.join(
            rf"C:\Users\{USERNAME}\Desktop",
            folder_name
        )

        os.makedirs(path, exist_ok=True)

        return {
            "status": "success",
            "action": "created_folder"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def rename_folder(old_name, new_name):
    try:
        desktop = rf"C:\Users\{USERNAME}\Desktop"

        old_path = os.path.join(desktop, old_name)
        new_path = os.path.join(desktop, new_name)

        if not os.path.exists(old_path):
            return {
                "status": "failed",
                "action": f"Folder {old_name} does not exist"
            }

        os.rename(old_path, new_path)

        return {
            "status": "success",
            "action":"renamed_folder"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }
def delete_folder(folder_name):
    try:
        desktop = rf"C:\Users\{USERNAME}\Desktop"

        folder_path = os.path.join(desktop, folder_name)

        if not os.path.exists(folder_path):
            return {
                "status": "failed",
                "action": f"Folder {folder_name} does not exist"
            }

        import shutil
        shutil.rmtree(folder_path)

        return {
            "status": "success",
            "action": "deleted_folder"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def create_file(file_name):
    try:
        file_path = os.path.join(
            rf"C:\Users\{USERNAME}\Desktop",
            file_name
        )

        with open(file_path, "a", encoding="utf-8"):
            pass

        return {
            "status": "success",
            "action": "created_file"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def rename_file(old_name, new_name):
    try:
        desktop = rf"C:\Users\{USERNAME}\Desktop"

        old_path = os.path.join(desktop, old_name)
        new_path = os.path.join(desktop, new_name)

        if not os.path.exists(old_path):
            return {
                "status": "failed",
                "action": f"{old_name} does not exist"
            }

        os.rename(old_path, new_path)

        return {
            "status": "success",
            "action": "renamed_file"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def delete_file(file_name):
    try:
        file_path = os.path.join(
            rf"C:\Users\{USERNAME}\Desktop",
            file_name
        )

        if not os.path.exists(file_path):
            return {
                "status": "failed",
                "action": f"{file_name} does not exist"
            }

        os.remove(file_path)

        return {
            "status": "success",
            "action": "deleted_file"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def copy_file(source_name, destination_name):
    try:
        desktop = rf"C:\Users\{USERNAME}\Desktop"

        source = os.path.join(desktop, source_name)
        destination = os.path.join(desktop, destination_name)

        shutil.copy2(source, destination)

        return {
            "status": "success",
            "action": "copied_file"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def move_file(file_name, destination_folder):
    try:
        desktop = rf"C:\Users\{USERNAME}\Desktop"

        source = os.path.join(desktop, file_name)

        destination = os.path.join(
            rf"C:\Users\{USERNAME}",
            destination_folder,
            file_name
        )

        shutil.move(source, destination)

        return {
            "status": "success",
            "action": "moved_file"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }

def locate_file(file_name):
    found = find_file(file_name)

    if found:
        return {
            "status": "success",
            "action": found
        }

    return {
        "status": "failed",
        "action": "located_file"
    }
def get_current_time():
    now = datetime.now()

    return {
        "status": "success",
        "action": now.strftime("%I:%M %p")
    }
def get_current_date():
    return {
        "status": "success",
        "action": datetime.now().strftime("%d %B %Y")
    }
def get_current_day():
    return {
        "status": "success",
        "action": datetime.now().strftime("%A")
    }

def get_internet_speed():
    st = speedtest.Speedtest()

    download = round(
        st.download() / 1024 / 1024,
        2
    )

    upload = round(
        st.upload() / 1024 / 1024,
        2
    )

    return {
        "status": "success",
        "action": f"Download {download} Mbps, Upload {upload} Mbps"
    }
def get_current_wifi():
    output = subprocess.check_output(
        "netsh wlan show interfaces",
        shell=True
    ).decode(errors="ignore")

    for line in output.splitlines():
        if "SSID" in line and "BSSID" not in line:
            return {
                "status": "success",
                "action": line.split(":")[1].strip()
            }

    return {
        "status": "failed",
        "action": "Not connected"
    }
def list_wifi_networks():
    output = subprocess.check_output(
        "netsh wlan show networks",
        shell=True
    ).decode(errors="ignore")

    ssids = []

    for line in output.splitlines():
        line = line.strip()

        if line.startswith("SSID"):
            parts = line.split(":", 1)

            if len(parts) > 1:
                ssid = parts[1].strip()

                if ssid and ssid not in ssids:
                    ssids.append(ssid)

    return {
        "status": "success",
        "action": ", ".join(ssids[:20])
    }
def get_cpu_temperature():
    try:
        w = wmi.WMI(
            namespace="root\\OpenHardwareMonitor"
        )

        temps = w.Sensor()

        for sensor in temps:
            if sensor.SensorType == "Temperature":
                return {
                    "status": "success",
                    "action": f"{sensor.Value}°C"
                }

    except:
        pass

    return {
    "status": "failed",
    "action": "CPU temperature unavailable on this device"
}


def get_gpu_usage():
    gpus = GPUtil.getGPUs()

    if not gpus:
        return {
            "status": "failed",
            "action": "No GPU detected"
        }

    gpu = gpus[0]

    return {
        "status": "success",
        "action": f"{gpu.load * 100:.0f}%"
    }
def get_gpu_memory():
    gpus = GPUtil.getGPUs()

    if not gpus:
        return {
            "status": "failed",
            "action": "No GPU detected"
        }

    gpu = gpus[0]

    return {
        "status": "success",
        "action": f"{gpu.memoryUsed:.0f} MB / {gpu.memoryTotal:.0f} MB"
    }
def get_public_ip():
    ip = requests.get(
        "https://api.ipify.org"
    ).text

    return {
        "status": "success",
        "action": ip
    }
def run_tool(action):
    tool = TOOLS.get(action)

    if not tool:
        return {
            "status": "failed",
            "action": f"Tool {action} not found"
        }

    return tool()
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
            # If target is actually a website, redirect to open_website
            website_targets = ['youtube', 'gmail', 'instagram', 'netflix', 
                               'twitter', 'linkedin', 'whatsapp', 'facebook',
                               'reddit', 'chatgpt', 'claude', 'amazon', 'flipkart']
            if target in website_targets:
                url = WEBSITES.get(target, f'https://{target}.com')
                subprocess.Popen([APP_PATHS['chrome'], url])
                return jsonify({'status': 'success', 'action': f'Opening {target} for you sir'})
            
            if target in APP_PATHS:
                try:
                    subprocess.Popen([APP_PATHS[target]])
                except Exception:
                    subprocess.Popen(f'start {target}', shell=True)
            else:
                subprocess.Popen(f'start {target}', shell=True)
            return jsonify({
    'status': 'success',
    'action': 'opened_app'
})
        # Open Folder
        elif action == 'open_folder':

            folder_name = target or query

            if folder_name in FOLDER_PATHS:
                path = FOLDER_PATHS[folder_name]
            else:
                path = os.path.join(
                    rf'C:\Users\{USERNAME}\Desktop',
                    folder_name
                )

            if os.path.exists(path):
                subprocess.Popen(['explorer', path])

                return jsonify({
                    'status': 'success',
                    'action': "opened_folder"
                })

            return jsonify({
                'status': 'failed',
                'action': f'Folder {folder_name} not found'
            })

        # Open Website
        elif action == 'open_website':
            # Clean target — remove .com, .in, .org etc
            target_clean = target.replace('.com', '').replace('.in', '').replace('.org', '').replace('.net', '').strip()

            if target_clean in WEBSITES:
                url = WEBSITES[target_clean]
            elif target in WEBSITES:
                url = WEBSITES[target]
            else:
                if '.' in target:
                    url = f'https://{target}'
                else:
                    url = f'https://{target_clean}.com'

            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({
    'status': 'success',
    'action': 'opened_website'
})

        # YouTube Search
        elif action == 'youtube_search':
            url = f'https://youtube.com/results?search_query={query.replace(" ", "+")}'
            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({'status': 'success', 'action': "searched_youtube"})

        # Google Search
        elif action == 'google_search':
            url = f'https://google.com/search?q={query.replace(" ", "+")}'
            subprocess.Popen([APP_PATHS['chrome'], url])
            return jsonify({
    'status': 'success',
    'action': 'searched_google'
})

        # Open File
        elif action == 'open_file':
            found = find_file(query)
            if found:
                os.startfile(found)
                return jsonify({'status': 'success', 'action': "opened_file"})
            else:
                return jsonify({'status': 'failed', 'action': f'Sorry, I could not find {query} on your laptop'})

        # Screenshot
        elif action == 'screenshot':
            return jsonify(take_screenshot())

        # Clipboard Read
        elif action == 'clipboard_read':
         return jsonify(read_clipboard())

        # Clipboard Write
        elif action == 'clipboard_write':
            return jsonify(write_clipboard(query))
        
        #Battery
        elif action == "battery":
            return jsonify(run_tool("battery"))

        # Volume
        elif action == 'volume_up':
          return jsonify(volume_up())

        elif action == 'volume_down':
          return jsonify(volume_down())

        elif action == 'mute':
            return jsonify(mute())
        elif action == 'cpu':
            return jsonify(run_tool("cpu"))

        elif action == 'ram':
         return jsonify(run_tool("ram"))

        elif action == 'disk':
         return jsonify(run_tool("disk"))

        elif action == 'network':
            return jsonify(run_tool("network"))

        elif action == 'ip_address':
            result = get_ip_address()
            print(result)
            return jsonify(run_tool("ip_address"))

        elif action == "brightness":
            return jsonify(run_tool("brightness"))

        elif action == "brightness_up":
            return jsonify(increase_brightness())

        elif action == "brightness_down":
            return jsonify(decrease_brightness())

        elif action == "set_brightness":
            return jsonify(set_brightness(query))

        elif action == "running_apps":
            return jsonify(get_running_apps())

        elif action == "close_app":
            return jsonify(kill_app(target))

        elif action == "create_folder":
            return jsonify(create_folder(query))

        elif action == "rename_folder":
            return jsonify(
        rename_folder(target, query)
    )

        elif action == "delete_folder":

            folder_name = query or target

            return jsonify(
        delete_folder(folder_name)
    )

        elif action == "create_file":
            return jsonify(create_file(query))

        elif action == "rename_file":
            return jsonify(
        rename_file(target, query)
    )

        elif action == "delete_file":
            return jsonify(
        delete_file(query or target)
    )
        elif action == "copy_file":
            return jsonify(
        copy_file(target, query)
    )

        elif action == "move_file":
            return jsonify(
                move_file(target, query)
            )

        elif action == "find_file":
            return jsonify(
                locate_file(query or target)
            )
        elif action == "current_time":
            return jsonify({"status": "success", "action": datetime.now().strftime("%H:%M:%S")})
        elif action == "current_date":
            return jsonify({"status": "success", "action": datetime.now().strftime("%Y-%m-%d")})
        elif action == "current_day":
            return jsonify({"status": "success", "action": datetime.now().strftime("%A")})
        elif action == "internet_speed":
            return jsonify( get_internet_speed())
        elif action == "current_wifi":
            return jsonify(get_current_wifi())
        elif action == "list_wifi_networks":
            return jsonify(list_wifi_networks())
        elif action == "cpu_temperature":
            return jsonify(get_cpu_temperature())
        elif action == "gpu_usage":
                return jsonify(get_gpu_usage())
        elif action == "gpu_memory":
                return jsonify(get_gpu_memory())
        elif action == "public_ip":
                return jsonify(get_public_ip())

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

# ============================================
# DYNAMIC CODE EXECUTION
# ============================================
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

    code_lower = code.lower()

    for blocked in BLOCKED_KEYWORDS:
        if blocked.lower() in code_lower:
            print(f"=== BLOCKED DANGEROUS CODE: {blocked} ===")

            return jsonify({
                'status': 'blocked',
                'action': 'I blocked that command for safety reasons'
            }), 403

    print("=== EXECUTING DYNAMIC CODE ===")
    print(f"Description: {description}")
    print(f"Code: {code}")
    print("==============================")

    try:
        output = io.StringIO()

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

        with redirect_stdout(output):
            exec(code, exec_globals)

        result = output.getvalue().strip()

        print(f"Dynamic Result: {result}")

        return jsonify({
            'status': 'success',
            'action': result or description or 'Done sir'
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
