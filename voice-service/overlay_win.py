r"""
overlay_win.py - a see-through window with REAL per-pixel transparency (Windows).

The corner reactor is drawn with soft glow, so it needs a window that can blend every pixel
with what is behind it (a "layered window" updated with UpdateLayeredWindow). The window:
  - sits above all other windows, never takes focus, has no taskbar button
  - lets mouse clicks pass straight through to the app underneath
"""
import ctypes
from ctypes import wintypes

WS_POPUP = 0x80000000
WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_EX_TOOLWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE = 0x8, 0x20, 0x80, 0x80000, 0x08000000
SW_HIDE, SW_SHOWNOACTIVATE = 0, 4
SWP_NOSIZE, SWP_NOMOVE, SWP_NOACTIVATE = 0x1, 0x2, 0x10
ULW_ALPHA, AC_SRC_OVER, AC_SRC_ALPHA = 2, 0, 1
BI_RGB, DIB_RGB_COLORS, PM_REMOVE = 0, 0, 1


class BLENDFUNCTION(ctypes.Structure):
    _fields_ = [("BlendOp", ctypes.c_ubyte), ("BlendFlags", ctypes.c_ubyte),
                ("SourceConstantAlpha", ctypes.c_ubyte), ("AlphaFormat", ctypes.c_ubyte)]


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG),
                ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG),
                ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 3)]


def _api():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    kernel32.GetModuleHandleW.argtypes, kernel32.GetModuleHandleW.restype = [wintypes.LPCWSTR], wintypes.HMODULE
    user32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
                                       ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                       wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.GetDC.argtypes, user32.GetDC.restype = [wintypes.HWND], wintypes.HDC
    user32.ReleaseDC.argtypes, user32.ReleaseDC.restype = [wintypes.HWND, wintypes.HDC], ctypes.c_int
    user32.ShowWindow.argtypes, user32.ShowWindow.restype = [wintypes.HWND, ctypes.c_int], wintypes.BOOL
    user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user32.SetWindowPos.restype = wintypes.BOOL
    user32.DestroyWindow.argtypes, user32.DestroyWindow.restype = [wintypes.HWND], wintypes.BOOL
    user32.UpdateLayeredWindow.argtypes = [wintypes.HWND, wintypes.HDC, ctypes.POINTER(wintypes.POINT), ctypes.POINTER(wintypes.SIZE),
                                           wintypes.HDC, ctypes.POINTER(wintypes.POINT), wintypes.COLORREF,
                                           ctypes.POINTER(BLENDFUNCTION), wintypes.DWORD]
    user32.UpdateLayeredWindow.restype = wintypes.BOOL
    user32.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
    user32.PeekMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.GetSystemMetrics.argtypes, user32.GetSystemMetrics.restype = [ctypes.c_int], ctypes.c_int

    gdi32.CreateCompatibleDC.argtypes, gdi32.CreateCompatibleDC.restype = [wintypes.HDC], wintypes.HDC
    gdi32.CreateDIBSection.argtypes = [wintypes.HDC, ctypes.POINTER(BITMAPINFO), wintypes.UINT,
                                       ctypes.POINTER(ctypes.c_void_p), wintypes.HANDLE, wintypes.DWORD]
    gdi32.CreateDIBSection.restype = wintypes.HBITMAP
    gdi32.SelectObject.argtypes, gdi32.SelectObject.restype = [wintypes.HDC, wintypes.HGDIOBJ], wintypes.HGDIOBJ
    gdi32.DeleteObject.argtypes, gdi32.DeleteObject.restype = [wintypes.HGDIOBJ], wintypes.BOOL
    gdi32.DeleteDC.argtypes, gdi32.DeleteDC.restype = [wintypes.HDC], wintypes.BOOL
    return user32, gdi32, kernel32


def screen_size():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.GetSystemMetrics.argtypes, user32.GetSystemMetrics.restype = [ctypes.c_int], ctypes.c_int
    return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)


class LayeredWindow:
    def __init__(self, width, height, x, y):
        self.w, self.h, self.x, self.y = width, height, x, y
        self.user32, self.gdi32, kernel32 = _api()
        u, g = self.user32, self.gdi32

        ex = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT
        # "STATIC" is a window class every Windows has, so no window procedure is needed
        self.hwnd = u.CreateWindowExW(ex, "STATIC", "Jarvis overlay", WS_POPUP, x, y, width, height,
                                      None, None, kernel32.GetModuleHandleW(None), None)
        if not self.hwnd:
            raise OSError(f"CreateWindowEx failed (error {ctypes.get_last_error()})")

        self.hdc_screen = u.GetDC(None)
        self.hdc_mem = g.CreateCompatibleDC(self.hdc_screen)
        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = width
        bmi.bmiHeader.biHeight = -height            # negative = rows go top to bottom
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = 32
        bmi.bmiHeader.biCompression = BI_RGB
        self._bits = ctypes.c_void_p()
        self.hbmp = g.CreateDIBSection(self.hdc_mem, ctypes.byref(bmi), DIB_RGB_COLORS, ctypes.byref(self._bits), None, 0)
        if not self.hbmp or not self._bits.value:
            raise OSError(f"CreateDIBSection failed (error {ctypes.get_last_error()})")
        self._old = g.SelectObject(self.hdc_mem, self.hbmp)
        self.visible = False

    def update(self, bgra):
        """bgra: uint8 numpy array (h, w, 4), premultiplied alpha. Returns True if Windows accepted it."""
        if bgra.shape != (self.h, self.w, 4) or not bgra.flags["C_CONTIGUOUS"]:
            raise ValueError("frame must be a C-contiguous uint8 array of shape (h, w, 4)")
        ctypes.memmove(self._bits.value, bgra.ctypes.data, self.w * self.h * 4)
        dst = wintypes.POINT(self.x, self.y)
        size = wintypes.SIZE(self.w, self.h)
        src = wintypes.POINT(0, 0)
        blend = BLENDFUNCTION(AC_SRC_OVER, 0, 255, AC_SRC_ALPHA)
        return bool(self.user32.UpdateLayeredWindow(self.hwnd, self.hdc_screen, ctypes.byref(dst), ctypes.byref(size),
                                                    self.hdc_mem, ctypes.byref(src), 0, ctypes.byref(blend), ULW_ALPHA))

    def show(self):
        if not self.visible:
            self.user32.ShowWindow(self.hwnd, SW_SHOWNOACTIVATE)
            self.visible = True
        # keep above everything else, without taking focus
        self.user32.SetWindowPos(self.hwnd, wintypes.HWND(-1), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

    def hide(self):
        if self.visible:
            self.user32.ShowWindow(self.hwnd, SW_HIDE)
            self.visible = False

    def pump(self):
        """Let Windows deliver its messages (keeps the window 'responding')."""
        msg = wintypes.MSG()
        while self.user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
            self.user32.TranslateMessage(ctypes.byref(msg))
            self.user32.DispatchMessageW(ctypes.byref(msg))

    def destroy(self):
        try:
            self.gdi32.SelectObject(self.hdc_mem, self._old)
            self.gdi32.DeleteObject(self.hbmp)
            self.gdi32.DeleteDC(self.hdc_mem)
            self.user32.ReleaseDC(None, self.hdc_screen)
            self.user32.DestroyWindow(self.hwnd)
        except Exception:
            pass
