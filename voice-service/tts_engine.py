r"""
tts_engine.py - speech with a safety net.

Jarvis normally speaks with Microsoft's online voice (edge-tts). That needs internet
and Microsoft changes its service now and then, which makes old versions fail. When
that happens (or the voice service itself is down) this falls back to the voice that is
built into Windows, which needs nothing: no internet, no extra packages.

    speak_with_fallback(text, edge_speak)  ->  "edge" | "windows"
    windows_speak(text)                     blocks until finished
    stop_windows_speech()                   used by the Stop button / hotkey
"""
import os
import queue
import re
import subprocess
import threading

NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_state = {"proc": None, "stopped": False}

_SCRIPT = (
    "[Console]::InputEncoding=[System.Text.Encoding]::UTF8;"
    "Add-Type -AssemblyName System.Speech;"
    "$t=[Console]::In.ReadToEnd();"
    "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
    "try{$s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female)}catch{};"
    "$s.Speak($t)"
)


def windows_speak(text, timeout=120):
    """Speak with the built-in Windows voice. Blocks until the speech has finished."""
    if os.name != "nt":
        raise RuntimeError("the built-in Windows voice is only available on Windows")
    _state["stopped"] = False
    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", _SCRIPT],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        creationflags=NO_WINDOW,
    )
    _state["proc"] = proc
    try:
        _, err = proc.communicate(text.encode("utf-8"), timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError("the Windows voice took too long")
    finally:
        _state["proc"] = None
    if proc.returncode not in (0, None) and not _state["stopped"]:
        raise RuntimeError((err or b"").decode("utf-8", "replace").strip() or f"exit code {proc.returncode}")


def stop_windows_speech():
    proc = _state.get("proc")
    if proc is not None and proc.poll() is None:
        _state["stopped"] = True
        try:
            proc.terminate()
        except Exception:
            pass


def speak_with_fallback(text, edge_speak, windows=None, log=print):
    """Try the online voice first. Raises only if BOTH voices fail."""
    windows = windows or windows_speak
    try:
        edge_speak(text)
        return "edge"
    except Exception as exc:
        log(f"[tts] online voice failed ({type(exc).__name__}: {exc}) - using the Windows voice")
    windows(text)
    return "windows"


# ---------------------------------------------------------------------------
# Speak sentence by sentence: the first sentence starts playing as soon as it is
# ready while the next ones are still being generated.
# ---------------------------------------------------------------------------
def split_sentences(text, first_max=130, max_len=220):
    """Short first chunk (fast start), then sentence-sized chunks."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not text:
        return []
    pieces = re.split(r"(?<=[.!?;:])\s+", text)

    merged, buf = [], ""
    for p in pieces:                                  # glue tiny pieces ("Sir.") onto their neighbour
        buf = f"{buf} {p}".strip() if buf else p
        if len(buf) >= 40:
            merged.append(buf)
            buf = ""
    if buf:
        if merged and len(buf) < 40:
            merged[-1] += " " + buf
        else:
            merged.append(buf)

    def cut(piece, limit):
        at = piece.rfind(", ", 0, limit)
        if at < 40:
            at = piece.rfind(" ", 0, limit)
        return at + 1 if at > 0 else limit

    out = []
    for piece in merged:
        while len(piece) > max_len:
            k = cut(piece, max_len)
            out.append(piece[:k].strip())
            piece = piece[k:].strip()
        if piece:
            out.append(piece)
    if out and len(out[0]) > first_max:               # keep the first chunk short so audio starts quickly
        k = cut(out[0], first_max)
        head, tail = out[0][:k].strip(), out[0][k:].strip()
        out[0:1] = [head] + ([tail] if tail else [])
    return out


def speak_pipeline(sentences, synth, play, windows=None, should_stop=lambda: False,
                   cleanup=lambda path: None, log=print, prefetch=2, on_first_audio=None):
    """
    synth(sentence) -> audio file     (slow: network)
    play(file)                        (blocks while it plays)
    Returns "edge", "windows" or "mixed". Raises only if the Windows voice also fails.
    """
    if not sentences:
        return "none"
    windows = windows or windows_speak
    q = queue.Queue(maxsize=prefetch)
    abort = threading.Event()

    def put(item):
        while not abort.is_set():
            try:
                q.put(item, timeout=0.2)
                return True
            except queue.Full:
                continue
        return False

    def producer():
        for i, sentence in enumerate(sentences):
            if abort.is_set() or should_stop():
                break
            try:
                path = synth(sentence)
            except Exception as exc:
                put(("error", i, exc))
                return
            if not put(("ok", i, path)):
                cleanup(path)
                return
        put(("done", len(sentences), None))

    threading.Thread(target=producer, daemon=True).start()

    played, engine = 0, "edge"
    try:
        while True:
            kind, i, payload = q.get()
            if kind == "done":
                break
            if kind == "error":
                log(f"[tts] online voice failed on sentence {i + 1} ({type(payload).__name__}: {payload}) - using the Windows voice for the rest")
                if not should_stop():
                    windows(" ".join(sentences[i:]))
                    engine = "windows" if played == 0 else "mixed"
                break
            if should_stop():
                cleanup(payload)
                break
            if played == 0 and on_first_audio:
                on_first_audio()
            play(payload)
            played += 1
            if should_stop():
                break
    finally:
        abort.set()
        while True:                                   # remove audio files that were generated but never played
            try:
                kind, _, payload = q.get_nowait()
            except queue.Empty:
                break
            if kind == "ok":
                cleanup(payload)
    return engine
