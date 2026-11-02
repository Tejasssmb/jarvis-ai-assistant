r"""
choose_voice.py - listen to Jarvis's possible voices and pick one.

Run it with Jarvis RUNNING (python jarvis_launcher.py), from the project folder:
    python voice-service\choose_voice.py

It plays the same sentence in each voice. For every voice you can press:
    Enter  = next voice          r = hear it again         s = KEEP this voice
    1..10  = jump to that voice  q = quit without changing anything

The choice is saved in voice-service\voice_config.json and used from then on.
(Fine-tuning: edit that file - "rate": "-5%" speaks slower, "pitch": "-2Hz" sounds deeper.)
"""
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import requests

SERVICE = "http://127.0.0.1:5001"
SAMPLE = "Good afternoon, sir. All systems are operational. How may I assist you today?"

# (voice id, description)
CANDIDATES = [
    ("en-GB-SoniaNeural", "British woman - calm and composed, butler-like (closest to a JARVIS / EDITH feel)"),
    ("en-GB-LibbyNeural", "British woman - warm and friendly"),
    ("en-US-JennyNeural", "American woman - clear, helpful assistant voice"),
    ("en-US-AriaNeural", "American woman - confident and expressive"),
    ("en-US-AvaNeural", "American woman - smooth and natural"),
    ("en-IE-EmilyNeural", "Irish woman - soft and gentle"),
    ("en-AU-NatashaNeural", "Australian woman - bright and upbeat"),
    ("en-IN-NeerjaNeural", "Indian-English woman - a familiar accent"),
    ("en-GB-RyanNeural", "British man - closest to the movie JARVIS"),
    ("en-US-GuyNeural", "American man - the old voice"),
]


def post(path, body, timeout=120):
    return requests.post(f"{SERVICE}{path}", json=body, timeout=timeout)


def play(index):
    voice, desc = CANDIDATES[index]
    print(f"\n[{index + 1}] {voice}\n    {desc}")
    post("/voice", {"voice": voice, "rate": "+0%", "pitch": "+0Hz"})
    res = post("/speak", {"text": SAMPLE})
    if res.status_code != 200:
        print(f"    (could not speak: {res.text[:120]})")
    elif (res.json() or {}).get("engine") == "windows":
        print("    (this voice is not available right now - you heard the plain Windows voice instead)")


def main():
    try:
        current = requests.get(f"{SERVICE}/voice", timeout=5).json()
    except Exception:
        print("Jarvis is not running. Start it first:  python jarvis_launcher.py")
        return 1
    print(f"Current voice: {current.get('voice')}")
    print("\nVoices to try:")
    for i, (voice, desc) in enumerate(CANDIDATES, 1):
        print(f"  {i:>2}. {desc}   [{voice}]")

    i = 0
    play(i)
    while True:
        answer = input("\nEnter = next | r = again | s = keep this voice | 1-%d = jump | q = quit: " % len(CANDIDATES)).strip().lower()
        if answer == "q":
            post("/voice", {"voice": current.get("voice"), "rate": current.get("rate"), "pitch": current.get("pitch")})
            print("No change made.")
            return 0
        if answer == "s":
            voice = CANDIDATES[i][0]
            post("/voice", {"voice": voice, "rate": "+0%", "pitch": "+0Hz", "save": True})
            print(f"\nSaved: Jarvis will now use {voice}.")
            return 0
        if answer == "r":
            pass
        elif answer.isdigit() and 1 <= int(answer) <= len(CANDIDATES):
            i = int(answer) - 1
        else:
            i = (i + 1) % len(CANDIDATES)
        play(i)


if __name__ == "__main__":
    sys.exit(main())
