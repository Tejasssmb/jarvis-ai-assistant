import psutil

def get_battery():
    battery = psutil.sensors_battery()

    if battery:
        percent = battery.percent
        plugged = (
            "plugged in"
            if battery.power_plugged
            else "running on battery"
        )

        return {
            "status": "success",
            "action": f"Battery is at {percent}% and {plugged}"
        }

    return {
        "status": "failed",
        "action": "Could not read battery status"
    }