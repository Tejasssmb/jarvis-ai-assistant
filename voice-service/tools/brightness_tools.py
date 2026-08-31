import screen_brightness_control as sbc

def get_brightness():
    try:
        brightness = sbc.get_brightness()[0]

        return {
            "status": "success",
            "action": f"Brightness is {brightness}%"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }


def set_brightness(level):
    try:
        level = max(0, min(100, int(level)))

        sbc.set_brightness(level)

        return {
            "status": "success",
            "action": f"Brightness set to {level}%"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }


def increase_brightness():
    try:
        current = sbc.get_brightness()[0]

        new_level = min(100, current + 10)

        sbc.set_brightness(new_level)

        return {
            "status": "success",
            "action": f"Brightness increased to {new_level}%"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }


def decrease_brightness():
    try:
        current = sbc.get_brightness()[0]

        new_level = max(0, current - 10)

        sbc.set_brightness(new_level)

        return {
            "status": "success",
            "action": f"Brightness decreased to {new_level}%"
        }

    except Exception as e:
        return {
            "status": "failed",
            "action": str(e)
        }