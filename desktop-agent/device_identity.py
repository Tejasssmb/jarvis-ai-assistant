import json
import os
import uuid

DEVICE_FILE = "device.json"


def get_device():
    if os.path.exists(DEVICE_FILE):
        with open(DEVICE_FILE, "r") as f:
            return json.load(f)

    device = {
        "deviceId": str(uuid.uuid4()),
        "registered": False,
        "deviceToken": None,
    }

    with open(DEVICE_FILE, "w") as f:
        json.dump(device, f, indent=4)

    return device


def save_device(device):
    with open(DEVICE_FILE, "w") as f:
        json.dump(device, f, indent=4)