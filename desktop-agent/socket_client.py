import socketio
from device_identity import get_device
import os
from command_router import execute
from qr_generator import generate_qr
import json
from device_identity import (
    get_device,
    save_device,
)

sio = socketio.Client()


@sio.event
def connect():

    print("Connected to JARVIS Server")

    device = get_device()

    if device["registered"]:

        sio.emit("authenticate", device["deviceToken"])

    else:

        sio.emit(
            "register_desktop",
            {
                "deviceId": device["deviceId"]
            }
        )
@sio.on("desktop_registration")
def desktop_registration(data):
    registration_id = data["registrationId"]

    print(f"\nRegistration ID: {registration_id}")

    payload = {
    "type": "desktop_pair",
    "version": 1,
    "registrationId": registration_id,
}

    generate_qr(json.dumps(payload))

@sio.event
def disconnect():
    print("Disconnected from Server")

@sio.on("execute_command")
def desktop_command(data):

    command = data.get("command")

    print(f"\nReceived: {command}")

    execute(command)

@sio.on("authenticated")
def authenticated(data):

    print("✅ Desktop Agent Authenticated")

@sio.on("desktop_registered")
def desktop_registered(data):

    print("\nDesktop Successfully Paired!")

    device = get_device()

    device["registered"] = True
    device["deviceToken"] = data["deviceToken"]

    save_device(device)

    print("Device Token Saved")

    sio.disconnect()
def connect_to_server():
    server_url = os.getenv("SERVER_URL")
    sio.connect(server_url)
    sio.wait()