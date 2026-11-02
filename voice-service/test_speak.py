r"""
test_speak.py - finds out why Jarvis is silent.

Run it with Jarvis RUNNING (python jarvis_launcher.py), from the project folder:
    python voice-service\test_speak.py

It tries each way of speaking, one at a time, and tells you which one works.
"""
import asyncio
import os
import sys
import tempfile

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
LOG = os.path.join(os.path.dirname(HERE), "logs", "voice.log")


def tail(path, n=12):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:]).rstrip()
    except Exception:
        return "(no voice.log yet)"


def step_service():
    import requests
    print("1) The voice service (what Jarvis uses) ...")
    try:
        r = requests.post("http://127.0.0.1:5001/speak", json={"text": "Testing, one two three. Can you hear me, sir?"}, timeout=120)
    except Exception as exc:
        print(f"   NOT REACHABLE: {exc}")
        print("   -> Jarvis is not running. Start it with:  python jarvis_launcher.py")
        return None
    print(f"   answered {r.status_code}: {r.text[:300]}")
    if r.status_code == 200:
        engine = (r.json() or {}).get("engine", "?")
        print(f"   -> it spoke using: {engine}.  Did you HEAR it? If not, see steps 2-4 and the volume/output device.")
        return True
    print("   -> the voice service failed. Its own log says:")
    print("      " + tail(LOG).replace("\n", "\n      "))
    return False


def step_edge():
    print("\n2) The online voice (edge-tts) on its own ...")
    try:
        import edge_tts
        from importlib.metadata import version
    except ImportError:
        print("   edge-tts is NOT installed.  Fix:  pip install edge-tts")
        return False
    print(f"   edge-tts version {version('edge-tts')}")

    async def go(path):
        await asyncio.wait_for(edge_tts.Communicate("Testing the online voice.", "en-GB-RyanNeural").save(path), timeout=15)

    path = os.path.join(tempfile.gettempdir(), "jarvis_edge_test.mp3")
    try:
        asyncio.run(go(path))
        size = os.path.getsize(path)
        os.remove(path)
        print(f"   OK: generated {size} bytes of speech.")
        return True
    except Exception as exc:
        print(f"   FAILED: {type(exc).__name__}: {exc}")
        print("   -> Microsoft changes this service now and then; old versions stop working.")
        print("      Fix:  pip install -U edge-tts      (and check your internet connection)")
        print("      Meanwhile Jarvis automatically uses the Windows voice instead.")
        return False


def step_windows():
    import tts_engine
    print("\n3) The voice built into Windows (the safety net) ...")
    try:
        tts_engine.windows_speak("This is the Windows voice. If you can hear this, Jarvis can always speak.")
        print("   OK (you should have heard it).")
        return True
    except Exception as exc:
        print(f"   FAILED: {exc}")
        return False


def main():
    service = step_service()
    edge = step_edge()
    windows = step_windows()
    print("\n===== VERDICT =====")
    if service and not edge and windows:
        print("Online voice is broken, Windows voice works: Jarvis speaks in the Windows voice. Run: pip install -U edge-tts")
    elif service and (edge or windows):
        print("Speech works. If you heard nothing: check the Windows volume mixer and the selected output device.")
    elif service is None and windows:
        print("Start Jarvis first. (The Windows voice itself works.)")
    elif not (edge or windows):
        print("No voice works. Check your speakers/volume, and send me this whole output.")
    else:
        print("Send me this whole output.")


if __name__ == "__main__":
    main()
