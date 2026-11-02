r"""
overlay.py — the small reactor in the bottom-right corner of your screen.

It stays out of the way (transparent, always on top, clicks pass straight through to
Chrome or whatever you are using) and appears only while Jarvis is awake:

    blue = listening      green = thinking / processing      purple = speaking

It simply watches the voice loop (http://127.0.0.1:5002/status), so it works from any
app. Started automatically by jarvis_launcher.py.

Two looks: the realistic "glass orb" (default on Windows; needs numpy + Pillow) and a simple
line drawing that is used automatically if the orb cannot start. Force one with
JARVIS_OVERLAY_MODE=glass or JARVIS_OVERLAY_MODE=simple.

Try it by hand without the voice loop:
    python voice-service\overlay.py --demo          cycles through all three states
    python voice-service\overlay.py --state thinking
Settings (optional):  JARVIS_OVERLAY=0 (off)  JARVIS_OVERLAY_SIZE=220  JARVIS_OVERLAY_MARGIN=70
"""
import json
import math
import os
import random
import socket
import sys
import threading
import time
import urllib.request

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

STATUS_URL = "http://127.0.0.1:5002/status"
SIZE = int(os.getenv("JARVIS_OVERLAY_SIZE", "240"))
MARGIN_X = 20
MARGIN_BOTTOM = int(os.getenv("JARVIS_OVERLAY_MARGIN", "70"))     # keeps it above the taskbar
LOCK_PORT = 5003                                                  # one overlay at a time
KEY = "#010101"                                                   # this colour is see-through
FPS = 30
LAYERED_FPS = 24                                                   # the glass orb is heavier to draw

# Same personality as the big reactor: colour, revolve speed, pulse speed, pulse size.
STATES = {
    "idle":      dict(color=(80, 140, 228), spin=0.12, pulse=1.0, amp=0.020),
    "listening": dict(color=(80, 140, 228), spin=0.20, pulse=1.6, amp=0.030),
    "speaking":  dict(color=(160, 112, 228), spin=0.55, pulse=3.4, amp=0.055),
    "thinking":  dict(color=(60, 192, 160), spin=1.30, pulse=6.0, amp=0.075),
}
LABELS = {"listening": "LISTENING", "thinking": "PROCESSING", "speaking": "SPEAKING"}
WHITE = (235, 245, 255)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hexcol(c):
    return "#%02x%02x%02x" % tuple(max(2, min(255, int(v))) for v in c)   # never exactly the key colour


class Reactor:
    """All the animation maths, with no GUI in it (so it can be tested anywhere)."""

    def __init__(self, size=SIZE):
        self.size = size
        cfg = STATES["idle"]
        self.color = list(cfg["color"])
        self.spin_speed, self.pulse_speed, self.amp = cfg["spin"], cfg["pulse"], cfg["amp"]
        self.spin = self.pulse = 0.0
        self.appear = 0.0          # 0 hidden .. 1 fully shown (also used as scale)
        self.surge = 0.0           # flash when the state changes
        self.prev_state = "idle"
        rnd = random.Random(7)
        self.dots = [(rnd.uniform(0, math.tau), rnd.uniform(1.12, 1.38), rnd.uniform(0.15, 0.55) * rnd.choice((-1, 1)),
                      rnd.uniform(1.2, 2.4), rnd.uniform(0, math.tau)) for _ in range(26)]

    def update(self, dt, state, visible):
        cfg = STATES.get(state, STATES["idle"])
        k = 1 - math.exp(-2.2 * dt)                    # smooth hand-over between states
        self.spin_speed += (cfg["spin"] - self.spin_speed) * k
        self.pulse_speed += (cfg["pulse"] - self.pulse_speed) * k
        self.amp += (cfg["amp"] - self.amp) * k
        kc = 1 - math.exp(-2.4 * dt)
        self.color = [self.color[i] + (cfg["color"][i] - self.color[i]) * kc for i in range(3)]
        self.spin += self.spin_speed * dt
        self.pulse += self.pulse_speed * dt
        self.appear += ((1.0 if visible else 0.0) - self.appear) * (1 - math.exp(-7 * dt))
        if state != self.prev_state:
            if visible:
                self.surge = 1.0
            self.prev_state = state
        self.surge = max(0.0, self.surge - dt * 0.9)

    @property
    def hidden(self):
        return self.appear < 0.02

    def _ellipse(self, cx, cy, rx, ry, rot, a0=0.0, a1=math.tau, n=40):
        pts = []
        cr, sr = math.cos(rot), math.sin(rot)
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            x, y = rx * math.cos(a), ry * math.sin(a)
            pts += [cx + x * cr - y * sr, cy + x * sr + y * cr]
        return pts

    def geometry(self):
        s = self.appear
        size = self.size
        cx, cy = size / 2, size / 2 - 8
        R = size * 0.30 * s
        beat = math.sin(self.pulse) * self.amp
        col = tuple(self.color)
        bright = mix(col, WHITE, 0.30)
        g = {"cx": cx, "cy": cy}

        shell_r = R * (1 + beat + self.surge * 0.09)
        g["shell"] = (cx - shell_r, cy - shell_r, cx + shell_r, cy + shell_r)
        g["shell_color"] = hexcol(mix(col, WHITE, 0.15))

        # three great circles = a rotating wire-frame sphere
        g["rings"] = []
        for i in range(3):
            t = self.spin * (0.9 + 0.35 * i) + i * math.pi / 3
            g["rings"].append(self._ellipse(cx, cy, shell_r, max(2.0, shell_r * abs(math.cos(t))), self.spin * 0.6 * (1 if i % 2 == 0 else -1) + i))
        g["ring_color"] = hexcol(bright)

        # two orbiting arcs
        g["orbits"] = [
            self._ellipse(cx, cy, R * 1.28, R * 0.55, self.spin * 1.7, 0, 2.0),
            self._ellipse(cx, cy, R * 1.38, R * 0.90, -self.spin * 1.2 + 1.0, 0, 1.7),
        ]
        g["orbit_color"] = hexcol(mix(col, WHITE, 0.45))

        core = size * 0.055 * (1 + beat * 2.5 + self.surge * 0.45) * s
        g["core_glow"] = (cx - core * 2.1, cy - core * 2.1, cx + core * 2.1, cy + core * 2.1)
        g["core_glow_color"] = hexcol(mix(col, WHITE, 0.25))
        g["core"] = (cx - core, cy - core, cx + core, cy + core)
        g["core_color"] = hexcol(mix(col, WHITE, 0.85))

        g["dots"] = []
        for ang, rad, spd, dsize, tw in self.dots:
            a = ang + self.spin * spd
            r = R * rad * (1 + beat * 0.5 + self.surge * 0.12)
            x, y = cx + r * math.cos(a), cy + r * math.sin(a) * 0.9
            d = dsize * s * (0.8 + 0.4 * math.sin(self.pulse * 0.7 + tw))
            g["dots"].append((x - d, y - d, x + d, y + d))
        g["dot_color"] = hexcol(mix(col, WHITE, 0.55))
        g["label_xy"] = (cx, size - 14)
        g["label_color"] = hexcol(mix(col, WHITE, 0.4))
        return g


def read_status():
    try:
        with urllib.request.urlopen(STATUS_URL, timeout=1) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return {"state": "idle", "active": False, "live": False}


# ============================================================
# Windows / Tk plumbing
# ============================================================
def make_click_through(root):
    """
    No taskbar button, never takes focus, mouse clicks fall through to the app underneath,
    and the KEY colour is see-through. Applied to the top-level window ONLY (putting the
    "layered" style on Tk's inner child window makes the whole box render solid black).
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.WinDLL("user32", use_last_error=True)
        user32.GetAncestor.argtypes, user32.GetAncestor.restype = [wintypes.HWND, wintypes.UINT], wintypes.HWND
        user32.GetWindowLongW.argtypes, user32.GetWindowLongW.restype = [wintypes.HWND, ctypes.c_int], ctypes.c_long
        user32.SetWindowLongW.argtypes, user32.SetWindowLongW.restype = [wintypes.HWND, ctypes.c_int, ctypes.c_long], ctypes.c_long
        user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.COLORREF, wintypes.BYTE, wintypes.DWORD]
        user32.SetLayeredWindowAttributes.restype = wintypes.BOOL

        GA_ROOT, GWL_EXSTYLE, LWA_COLORKEY = 2, -20, 0x1
        LAYERED, TRANSPARENT, TOOLWINDOW, NOACTIVATE = 0x80000, 0x20, 0x80, 0x08000000

        root.update_idletasks()
        hwnd = user32.GetAncestor(root.winfo_id(), GA_ROOT) or int(root.wm_frame(), 16)
        ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex | LAYERED | TRANSPARENT | TOOLWINDOW | NOACTIVATE)
        # COLORREF is 0x00BBGGRR: KEY is (1, 1, 1)
        user32.SetLayeredWindowAttributes(hwnd, 0x010101, 255, LWA_COLORKEY)
        print(f"[overlay] click-through + transparency applied to window {hwnd}", flush=True)
    except Exception as exc:
        print(f"[overlay] click-through unavailable: {exc}", flush=True)


def jarvis_in_front():
    """True when the Jarvis window itself is the active window (then the corner reactor is redundant)."""
    if sys.platform != "win32":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.WinDLL("user32", use_last_error=True)
        user32.GetForegroundWindow.argtypes, user32.GetForegroundWindow.restype = [], wintypes.HWND
        user32.GetWindowTextW.argtypes, user32.GetWindowTextW.restype = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int], ctypes.c_int
        hwnd = user32.GetForegroundWindow()
        buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, buf, 256)
        return buf.value.lower().startswith("j.a.r.v.i.s")
    except Exception:
        return False


def single_instance():
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
        lock.listen(1)
        return lock
    except OSError:
        return None


def start_poller(shared, demo, fixed):
    def poll():
        t0 = time.time()
        while True:
            if demo:
                cycle = [("listening", 4), ("thinking", 4), ("speaking", 4), ("idle", 3)]
                total = sum(d for _, d in cycle)
                pos = (time.time() - t0) % total
                for name, d in cycle:
                    if pos < d:
                        shared.update(state=name, active=name != "idle")
                        break
                    pos -= d
            elif not fixed:
                shared.update(read_status())
            shared["front"] = jarvis_in_front()
            time.sleep(0.2)

    threading.Thread(target=poll, daemon=True).start()


def run_tk(demo, fixed):
    """The simple overlay (lines on a colour-keyed window). Used on other systems and as the safety net."""
    import tkinter as tk

    root = tk.Tk()
    root.withdraw()                                # invisible until Jarvis is awake
    root.title("Jarvis overlay")
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    try:
        root.wm_attributes("-transparentcolor", KEY)            # Windows: KEY colour becomes see-through
    except tk.TclError:
        pass
    root.configure(bg=KEY)
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{SIZE}x{SIZE}+{sw - SIZE - MARGIN_X}+{sh - SIZE - MARGIN_BOTTOM}")
    canvas = tk.Canvas(root, width=SIZE, height=SIZE, bg=KEY, highlightthickness=0, bd=0)
    canvas.pack()
    make_click_through(root)
    print(f"[overlay] ready: {SIZE}px at the bottom-right of a {sw}x{sh} screen; shows only while Jarvis is awake", flush=True)

    # --- canvas items (created once, then just moved/recoloured) ---
    z = (0, 0, 0, 0)
    shell = canvas.create_oval(*z, outline="#fff", width=1)
    rings = [canvas.create_line(0, 0, 1, 1, fill="#fff", width=1) for _ in range(3)]
    orbits = [canvas.create_line(0, 0, 1, 1, fill="#fff", width=2) for _ in range(2)]
    dots = [canvas.create_oval(*z, fill="#fff", outline="") for _ in range(26)]
    core_glow = canvas.create_oval(*z, fill="#fff", outline="")
    core = canvas.create_oval(*z, fill="#fff", outline="")
    label = canvas.create_text(SIZE / 2, SIZE - 14, text="", fill="#fff", font=("Segoe UI", 9, "bold"))
    shared = {"state": fixed or "idle", "active": bool(fixed), "live": False}

    start_poller(shared, demo, fixed)

    reactor = Reactor(SIZE)
    last = time.perf_counter()
    shown = {"v": False}
    ticks = {"n": 0}

    def set_shown(on):
        if on and not shown["v"]:
            root.deiconify()
            root.attributes("-topmost", True)
            shown["v"] = True
        elif not on and shown["v"]:
            root.withdraw()
            shown["v"] = False

    def tick():
        nonlocal last
        try:
            now = time.perf_counter()
            dt = min(now - last, 0.1)
            last = now
            state = shared.get("state", "idle")
            awake = bool(shared.get("active")) or state != "idle"
            # only while Jarvis is awake AND you are in another app (his own window shows the big reactor)
            visible = awake and not shared.get("front", False)
            reactor.update(dt, state, visible)

            if reactor.hidden and not visible:
                set_shown(False)
                root.after(150, tick)
                return
            set_shown(True)

            g = reactor.geometry()
            canvas.coords(shell, *g["shell"]); canvas.itemconfigure(shell, outline=g["shell_color"])
            for item, pts in zip(rings, g["rings"]):
                canvas.coords(item, *pts); canvas.itemconfigure(item, fill=g["ring_color"])
            for item, pts in zip(orbits, g["orbits"]):
                canvas.coords(item, *pts); canvas.itemconfigure(item, fill=g["orbit_color"])
            for item, box in zip(dots, g["dots"]):
                canvas.coords(item, *box); canvas.itemconfigure(item, fill=g["dot_color"])
            canvas.coords(core_glow, *g["core_glow"]); canvas.itemconfigure(core_glow, fill=g["core_glow_color"])
            canvas.coords(core, *g["core"]); canvas.itemconfigure(core, fill=g["core_color"])
            text = LABELS.get(state, "") if reactor.appear > 0.6 else ""
            if shared.get("live") and text:
                text = "LIVE  " + text
            canvas.itemconfigure(label, text=text, fill=g["label_color"])

            ticks["n"] += 1
            if ticks["n"] % 90 == 0:
                root.attributes("-topmost", True)       # stay above other windows
        except Exception as exc:                          # never die silently: the log shows why
            print(f"[overlay] error: {exc!r}", flush=True)
        root.after(int(1000 / FPS), tick)

    tick()
    root.mainloop()


def run_layered(demo, fixed):
    """The glass orb: drawn with soft glow into a window with real per-pixel transparency (Windows)."""
    from orb_render import OrbRenderer, to_bgra_premultiplied
    from overlay_win import LayeredWindow, screen_size

    sw, sh = screen_size()
    win = LayeredWindow(SIZE, SIZE, sw - SIZE - MARGIN_X, sh - SIZE - MARGIN_BOTTOM)
    renderer = OrbRenderer(SIZE)
    reactor = Reactor(SIZE)
    shared = {"state": fixed or "idle", "active": bool(fixed), "live": False}
    start_poller(shared, demo, fixed)
    print(f"[overlay] ready (glass orb, per-pixel transparency): {SIZE}px at the bottom-right of a {sw}x{sh} screen; shows only while Jarvis is awake", flush=True)

    last = time.perf_counter()
    first = True
    try:
        while True:
            t0 = time.perf_counter()
            win.pump()
            dt = min(t0 - last, 0.1)
            last = t0
            state = shared.get("state", "idle")
            awake = bool(shared.get("active")) or state != "idle"
            visible = awake and not shared.get("front", False)     # his own window shows the big reactor
            reactor.update(dt, state, visible)

            if reactor.hidden and not visible:
                win.hide()
                time.sleep(0.15)
                continue

            label = LABELS.get(state, "") if reactor.appear > 0.6 else ""
            frame = to_bgra_premultiplied(renderer.render(reactor, label, bool(shared.get("live"))))
            accepted = win.update(frame)
            if first and not accepted:
                raise RuntimeError("Windows did not accept the transparent window (UpdateLayeredWindow failed)")
            first = False
            win.show()
            time.sleep(max(0.0, 1.0 / LAYERED_FPS - (time.perf_counter() - t0)))
    finally:
        win.destroy()


def main():
    args = sys.argv[1:]
    demo = "--demo" in args
    fixed = args[args.index("--state") + 1] if "--state" in args else None

    if os.getenv("JARVIS_OVERLAY") == "0":
        print("[overlay] disabled (JARVIS_OVERLAY=0)")
        return
    lock = single_instance()
    if lock is None:
        print("[overlay] already running")
        return

    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)      # real pixels, not blurry scaling
        except Exception:
            pass

    mode = (os.getenv("JARVIS_OVERLAY_MODE") or ("glass" if sys.platform == "win32" else "simple")).lower()
    try:
        if mode == "glass":
            try:
                run_layered(demo, fixed)
                return
            except Exception as exc:
                print(f"[overlay] the glass orb could not start ({type(exc).__name__}: {exc}) - using the simple overlay instead", flush=True)
        run_tk(demo, fixed)
    finally:
        lock.close()


if __name__ == "__main__":
    main()
