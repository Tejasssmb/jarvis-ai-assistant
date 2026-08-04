def execute(command):

    print(f"\nExecuting command: {command}")

    if command == "test":

        print("✅ Test command executed")

    elif command == "open_notepad":

        print("Opening Notepad...")

    elif command == "take_screenshot":

        print("Taking Screenshot...")

    else:

        print("❌ Unknown command")