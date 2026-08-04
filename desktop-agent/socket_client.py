import socketio
import os
import platform
from command_router import execute

sio = socketio.Client()


@sio.event
def connect():
    print("Connected to JARVIS Server")

    sio.emit("register_desktop", {
        "deviceName": platform.node(),
        "platform": platform.system(),
        "version": "8.0.0"
    })


@sio.event
def disconnect():
    print("Disconnected from Server")

@sio.on("desktop_command")
def desktop_command(data):

    print(f"Received Command: {data}")

    execute(data.get("command"))


def connect_to_server():
    server_url = os.getenv("SERVER_URL")
    sio.connect(server_url)
    sio.wait()