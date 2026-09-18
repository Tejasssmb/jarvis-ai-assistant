import pyperclip
def read_clipboard():
    try:
        text = pyperclip.paste()

        return {
            "status": "success",
            "action": text
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
            "action": "copied_to_clipboard"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }