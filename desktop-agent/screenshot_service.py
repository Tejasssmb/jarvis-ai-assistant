import pyautogui
import time

def take_screenshot():

    filename = f"screenshot_{int(time.time())}.png"

    pyautogui.screenshot(filename)
    print(f"Screenshot saved: {filename}")
    return filename