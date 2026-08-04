import socketio
import os
from command_router import execute

sio = socketio.Client()


@sio.event
def connect():

    print("Connected to JARVIS Server")

    token = os.getenv("JWT")

    sio.emit("authenticate", token)

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


def connect_to_server():
    server_url = os.getenv("SERVER_URL")
    sio.connect(server_url)
    sio.wait()