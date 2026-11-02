"""
ui_window.py — find / focus / launch the Jarvis window (Windows).

Used by wake.py (on "Hey Jarvis") and by jarvis_launcher.py.
Jarvis runs in its own app-style browser window (no tabs, no address bar):
    chrome --app=http://localhost:5173/
The window title comes from client/index.html -> "J.A.R.V.I.S".
"""
import os
import subprocess
import time
import webbrowser

UI_URL = os.getenv("JARVIS_UI_URL", "http://localhost:5173/")
TITLE_PREFIX = "j.a.r.v.i.s"

_CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def _is_windows():
    return os.name == "nt"


def _win_api():
    """user32/kernel32 with explicit signatures (needed for 64-bit window handles)."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    H, B, D, I = wintypes.HWND, wintypes.BOOL, wintypes.DWORD, ctypes.c_int

    user32.IsWindowVisible.argtypes, user32.IsWindowVisible.restype = [H], B
    user32.GetWindowTextLengthW.argtypes, user32.GetWindowTextLengthW.restype = [H], I
    user32.GetWindowTextW.argtypes, user32.GetWindowTextW.restype = [H, wintypes.LPWSTR, I], I
    user32.GetClassNameW.argtypes, user32.GetClassNameW.restype = [H, wintypes.LPWSTR, I], I
    user32.IsIconic.argtypes, user32.IsIconic.restype = [H], B
    user32.ShowWindow.argtypes, user32.ShowWindow.restype = [H, I], B
    user32.GetForegroundWindow.argtypes, user32.GetForegroundWindow.restype = [], H
    user32.GetWindowThreadProcessId.argtypes = [H, ctypes.POINTER(D)]
    user32.GetWindowThreadProcessId.restype = D
    user32.AttachThreadInput.argtypes, user32.AttachThreadInput.restype = [D, D, B], B
    user32.BringWindowToTop.argtypes, user32.BringWindowToTop.restype = [H], B
    user32.SetForegroundWindow.argtypes, user32.SetForegroundWindow.restype = [H], B
    user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, D, ctypes.c_size_t]
    user32.keybd_event.restype = None
    kernel32.GetCurrentThreadId.argtypes, kernel32.GetCurrentThreadId.restype = [], D
    return user32, kernel32


def find_window():
    """Return the hwnd of the Jarvis window, or None."""
    if not _is_windows():
        return None
    import ctypes
    from ctypes import wintypes

    user32, _ = _win_api()
    found = []

    enum_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    @enum_type
    def enum_proc(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if not length:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        # Chrome and Edge both use this window class; matching on it and on the
        # START of the title avoids hitting e.g. a YouTube tab about Jarvis.
        if cls.value == "Chrome_WidgetWin_1" and title.value.lower().startswith(TITLE_PREFIX):
            found.append(hwnd)
        return True

    user32.EnumWindows.argtypes = [enum_type, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.EnumWindows(enum_proc, 0)
    return found[0] if found else None


def focus_window(hwnd):
    """Bring a window to the front, even from a background process."""
    if not _is_windows() or not hwnd:
        return False
    user32, kernel32 = _win_api()
    SW_RESTORE, SW_SHOW = 9, 5
    try:
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        else:
            user32.ShowWindow(hwnd, SW_SHOW)

        # Windows blocks SetForegroundWindow from background processes.
        # Attaching to the foreground thread's input queue lifts the block.
        fg = user32.GetForegroundWindow()
        fg_thread = user32.GetWindowThreadProcessId(fg, None) if fg else 0
        this_thread = kernel32.GetCurrentThreadId()
        attached = False
        if fg_thread and fg_thread != this_thread:
            attached = bool(user32.AttachThreadInput(this_thread, fg_thread, True))

        # Pressing/releasing ALT is the second well-known unlock.
        user32.keybd_event(0x12, 0, 0, 0)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.keybd_event(0x12, 0, 2, 0)

        if attached:
            user32.AttachThreadInput(this_thread, fg_thread, False)
        return True
    except Exception as exc:  # never let UI focus crash the voice loop
        print(f"[ui] focus failed: {exc}")
        return False


def launch_window(path="/"):
    """Open Jarvis (on a given page, e.g. /chat) in an app-style window."""
    url = UI_URL.rstrip("/") + path
    for exe in _CHROME_PATHS:
        if os.path.exists(exe):
            try:
                subprocess.Popen([exe, f"--app={url}", "--window-size=1280,800"])
                return True
            except Exception as exc:
                print(f"[ui] could not start {exe}: {exc}")
    webbrowser.open(url)
    return False


def show_jarvis(path="/", wait_after_launch=2.5):
    """Focus the Jarvis window if it exists (the page navigates itself), otherwise launch it on `path`."""
    hwnd = find_window()
    if hwnd:
        focus_window(hwnd)
        return "focused"
    launch_window(path)
    time.sleep(wait_after_launch)
    hwnd = find_window()
    if hwnd:
        focus_window(hwnd)
    return "launched"
