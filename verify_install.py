"""
verify_install.py - checks that every Jarvis v2 file in your project is EXACTLY the shipped version.

Run it from your project folder (the one that contains client, server, voice-service):
    python verify_install.py

For every file it prints OK, MODIFIED (differs from the shipped version) or MISSING.
Fix a MODIFIED / MISSING file by extracting jarvis-v4.zip over your project again and
choosing Replace. Do not hand-edit these files: a single misplaced line is enough to
stop Jarvis from starting.
"""
import hashlib
import os
import sys

MANIFEST = {
    "UPGRADE_V4.md": "39e6f250f656ceb5fc29be15c68eb9519b337de18c4ab95ae95af5b17dcf0f4b",
    "client/index.html": "63d00efff405230250a3ac48d066be47ca26f07ad31b9320f20ddfc1c254be05",
    "client/src/App.jsx": "7f12f536df7b766557d8e8063886c69d0b1ea21bb288a389f124c934b5b35bc5",
    "client/src/components/MessageContent.css": "41b1f17233679f78db1d807dedcdfc474a0ba9874a473f625901e5b4286085a1",
    "client/src/components/MessageContent.jsx": "802f577392309c9d4a1edc629a4b76ddb15c899b66c2094c42abe463615f9f77",
    "client/src/context/VoiceContext.jsx": "5c2b7db27d81faf43b3fdeeaeb0cc869b87800a84eef9e9388035fbb081430f3",
    "client/src/pages/Chat.jsx": "0026d30ab0cdad54ac7b81e0d50e67780b47c33614c8042e85a59c7036be2698",
    "client/src/pages/Core.jsx": "144bfc45a6db8614c02471e37b8d7f47a3ba0e76fc4643ee4e09b1442d1aec35",
    "client/src/services/socket.js": "3cf455c123f7312c09aa2108defd7ce65ad0006507ee3fb22456eb40ca79d1c2",
    "jarvis_launcher.py": "5c7107473bc8a51fe35e643508d6a98e636971fa46f4a713e835151d858ae9c3",
    "server/index.js": "2c3e6b27ee80d6b31b517529c747aaf4673346306c9086f3de3f1b7aaa74b7e3",
    "server/package.json": "09bb24e2ab6f78435cf0d4474c920092a970589835ccb914f39278d66d8309d5",
    "server/routes/chat.js": "321aa0f21397e0eb9cf87ad6c43d89c3b63e262b2e26c25ed1bc95b88dc89d89",
    "server/routes/integrations.js": "fe2c5f285aef0ffc23b362535b0aa2b045b145ba783e1cc6963f4a301a5e7406",
    "server/routes/reminder.js": "47e32fbb2c4ee363f9501e959cbf0672a2f00ca1abca6c515b37c5c8046d158b",
    "server/services/aiService.js": "82d44c108ffd28fb43c3aaa833eda9707d742ce0d9ac9c051315dd0c243feb19",
    "server/services/commandExecutor.js": "a2cafe1da18ec5500b5ba8f73aac7032e0e3474730d4b8ceb026520f6e9cf8be",
    "server/services/confirmIntent.js": "9751b9f0cbbdcd601e35f206b6d6486c0d4a28d2a50cba6093767429794c7755",
    "server/services/confirmationState.js": "13230e2107547e3fba44f1a98db14f1092fcfe129105a83e0862aa89d56b07a3",
    "server/services/emailService.js": "8abd3165b41dad42775d7cf191b05162670fc18e0601b033defbee6755ae2cf4",
    "server/services/integrationActions.js": "b1dd75f648f07324839da4622ad2c6e725aaa1e4b0681e1cd21ac7ae6bdacedc",
    "server/services/planValidator.js": "f1d7125d47c60f4fcee1ee18b02170aee18fbd2671eb0ec43e5835f0fcec9eaf",
    "server/services/processCommand.js": "1e67e304638b53de6ebcf69a680f7840b760a21be9b3468872acc1fe5cc66ed5",
    "server/services/speechFormatter.js": "8d76995d1dece057827a85943dab6a9bb2bdaaeb14e8384616f02290df448a99",
    "server/services/startupBriefing.js": "4e7e9b9b95b7003e5bca421a5ca36a1f2e5c1ddc51fd6d39fba20fd62c66bfa1",
    "server/services/systemPromptService.js": "6d80974b189c057c93405b8166b65086268cdf18a8f7f0c80b9c2cdbb2cf572a",
    "server/services/whatsappService.js": "8fad59244cb11dc32e0d8991dd551d6cfddca4519fe3feb860bc077b03a26e2f",
    "stop_jarvis.bat": "ba3f16c5734cb33faebb05e4e3b9b6173618f32b243500859246ab01edfb290c",
    "voice-service/app.py": "4864e651ce6ad6cb6bd9d82ded52dfe6d1ea97e69ef757a6b8a9f9ae6975ad28",
    "voice-service/calibrate_wake.py": "69fe83da90e68d5020b09b56b91251f491a3122fa0cb8b2f3d941273759fe668",
    "voice-service/choose_voice.py": "72a4888aa10a72638fa0d8f3483f63a2423514825cad5d91ea454e49dfeb7dd0",
    "voice-service/diagnose_voice.py": "2770b5e1ceaf8575b50728a383d2826ee8e28610161a93e146f3df89d485796f",
    "voice-service/enroll_voice.py": "64d72e2492a6e3544dc318b94a3f509aae4d147650692ccee459d9208102ab27",
    "voice-service/orb_render.py": "264cb4101e41307d3fbd3a18e9c8ea3fca2d61c7b142f60cb775aeb346c3fcca",
    "voice-service/overlay.py": "be024629b9bb68263213fdc88affcb2c8be9a9638fcc2018407b211ecdbcabdd",
    "voice-service/overlay_win.py": "8fd0e0815cb4a6789a1dacae028d924a33598b91f6466e9ddee197f3e6aaab70",
    "voice-service/requirements-voice.txt": "dab7c945f30e924dfc55bf302dcbee817c5db8076655d57b75b5fb30b4c227ce",
    "voice-service/speaker.py": "c59d5fd62a36e492df22073ee21a8dd224923b8239205b300ae725d7f7f93ccd",
    "voice-service/test_speak.py": "bb1dae0ddd42e623652d2eb3a3eee0bc8da5a7773ea1236bc74d1df5c4e2fccf",
    "voice-service/tts_engine.py": "9a2b55d6e71445a8e3edf68d2cd44af05e147c6fdf13f4d3c1029f8925dea191",
    "voice-service/ui_window.py": "ea1d1e55a265dc5ece44e2280040c8a1a98a23ec74ddbedc3ff4e15b1e542be5",
    "voice-service/wake.py": "dddde5e86074947dbd0b8f16f0dd6d5c58286fde702cf47aa84e7d8f72404d01",
}


def digest(path):
    with open(path, "rb") as f:
        data = f.read().replace(b"\r\n", b"\n")      # ignore Windows/Unix line endings
    return hashlib.sha256(data).hexdigest()


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    bad = 0
    for rel, expected in sorted(MANIFEST.items()):
        path = os.path.join(root, *rel.split("/"))
        if not os.path.exists(path):
            print(f"MISSING   {rel}")
            bad += 1
        elif digest(path) != expected:
            print(f"MODIFIED  {rel}")
            bad += 1
        else:
            print(f"OK        {rel}")
    print()
    if bad:
        print(f"{bad} file(s) differ from the shipped version.")
        print("-> Extract jarvis-v4.zip over your project again and choose Replace.")
        return 1
    print("All files match the shipped version.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
