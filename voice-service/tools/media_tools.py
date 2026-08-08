import subprocess

def volume_up():
    for _ in range(5):
        subprocess.run([
            'powershell',
            '-c',
            '(New-Object -com WScript.Shell).SendKeys([char]175)'
        ])

    return {
        "status": "success",
        "action": "Volume increased"
    }


def volume_down():
    for _ in range(5):
        subprocess.run([
            'powershell',
            '-c',
            '(New-Object -com WScript.Shell).SendKeys([char]174)'
        ])

    return {
        "status": "success",
        "action": "Volume decreased"
    }


def mute():
    subprocess.run([
        'powershell',
        '-c',
        '(New-Object -com WScript.Shell).SendKeys([char]173)'
    ])

    return {
        "status": "success",
        "action": "Muted"
    }