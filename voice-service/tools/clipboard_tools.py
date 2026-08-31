import pyperclip


def read_clipboard():
    try:
        text = pyperclip.paste()

        return {
            "status": "success",
            "action": f"Clipboard contains: {text}"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }


def write_clipboard(text):
    try:
        pyperclip.copy(text)

        return {
            "status": "success",
            "action": "Copied to clipboard"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }