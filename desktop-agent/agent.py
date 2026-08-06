from dotenv import load_dotenv
from socket_client import connect_to_server
from device_identity import get_device

load_dotenv()


def main():
    print("Starting JARVIS Desktop Agent...")

    device = get_device()

    print(f"Device ID : {device['deviceId']}")
    print(f"Registered: {device['registered']}")

    connect_to_server()


if __name__ == "__main__":
    main()