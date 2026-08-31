import psutil
import socket
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
def get_cpu_usage():
    cpu = psutil.cpu_percent(interval=1)

    return {
        "status": "success",
        "action": f"CPU usage is {cpu}%"
    }


def get_ram_usage():
    ram = psutil.virtual_memory()

    return {
        "status": "success",
        "action": f"RAM usage is {ram.percent}%"
    }


def get_disk_usage():
    disk = psutil.disk_usage('/')

    return {
        "status": "success",
        "action": f"Disk usage is {disk.percent}%"
    }
def get_network_status():
    interfaces = psutil.net_if_stats()

    active = [
        name
        for name, info in interfaces.items()
        if info.isup
    ]

    if active:
        return {
            "status": "success",
            "action": f"Connected to network via {', '.join(active[:3])}"
        }

    return {
        "status": "failed",
        "action": "No active network connection"
    }


def get_ip_address():
    try:
        ip = socket.gethostbyname(socket.gethostname())

        return {
            "status": "success",
            "action": f"Your IP address is {ip}"
        }

    except Exception:
        return {
            "status": "failed",
            "action": "Unable to determine IP address"
        }