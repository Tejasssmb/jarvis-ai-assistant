import time
import psutil

LOW_BATTERY_THRESHOLD = 20

last_alert_sent = False

def monitor_battery(send_alert):

    global last_alert_sent

    while True:

        try:

            battery = psutil.sensors_battery()

            if battery:

                percent = battery.percent
                plugged = battery.power_plugged

                if percent <= LOW_BATTERY_THRESHOLD and not plugged:

                    if not last_alert_sent:

                        send_alert(
                            "battery_low",
                            f"Battery is at {percent}%"
                        )

                        last_alert_sent = True

                else:

                    last_alert_sent = False

        except Exception as e:

            print("Battery Monitor Error:", e)

        time.sleep(60)