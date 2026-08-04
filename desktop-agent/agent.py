from dotenv import load_dotenv
from socket_client import connect_to_server

load_dotenv()


def main():
    print("Starting JARVIS Desktop Agent...")
    connect_to_server()


if __name__ == "__main__":
    main()