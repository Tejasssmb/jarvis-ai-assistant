from screenshot_service import take_screenshot
from screenshot_uploader import upload_screenshot
def execute(command):

    print(f"\nExecuting command: {command}")

    if command == "test":

        print("✅ Test command executed")

    elif command == "open_notepad":

        print("Opening Notepad...")

    elif command == "take_screenshot":

        print("Taking Screenshot...")

        file_path = take_screenshot()
        upload_result = upload_screenshot(file_path)

        print(f"Screenshot saved: {file_path}")

    else:

        print("❌ Unknown command")