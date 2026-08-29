const capabilities = [
  {
    name: "find_file",
    description: "Locate a file by name on the computer",
    inputs: ["filename"]
  },

  {
    name: "open_file",
    description: "Open an existing file",
    inputs: ["filename"]
  },

  {
    name: "create_folder",
    description: "Create a new folder",
    inputs: ["folder_name"]
  },

  {
    name: "move_file",
    description: "Move a file into a folder",
    inputs: ["file_name", "destination_folder"]
  },

  {
    name: "running_apps",
    description: "Get all currently running applications",
    inputs: []
  },

  {
    name: "close_app",
    description: "Close a running application",
    inputs: ["app_name"]
  },

  {
    name: "battery",
    description: "Get battery percentage and charging status",
    inputs: []
  },

  {
    name: "clipboard_read",
    description: "Read current clipboard contents",
    inputs: []
  }
];

module.exports = capabilities;