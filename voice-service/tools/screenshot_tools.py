import requests

def take_screenshot():
    requests.post(
        "http://localhost:5000/api/test-screenshot"
    )

    return {
        "status": "success",
        "action": "Taking screenshot..."
    }