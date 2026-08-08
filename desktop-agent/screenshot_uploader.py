import requests
import os

SERVER_URL = "http://localhost:5000"


def upload_screenshot(file_path):

    try:

        with open(file_path, "rb") as file:

            response = requests.post(
                f"{SERVER_URL}/api/upload-screenshot",
                files={
                    "screenshot": file
                }
            )

        data = response.json()

        print("Upload Response:", data)

        return data

    except Exception as e:

        print("Upload Failed:", e)

        return None