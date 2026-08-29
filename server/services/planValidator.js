const PROTECTED_APPS = [
  "code.exe",
  "node.exe",
  "python.exe"
];

const DANGEROUS_ACTIONS = [
  "delete_file",
  "delete_folder",
  "shutdown",
  "restart"
];

function checkAction(action, target = "") {

  if (
    action === "close_app" &&
    PROTECTED_APPS.includes(
      target.toLowerCase()
    )
  ) {
    return {
      approved: false,
      reason: "Protected application"
    };
  }

  if (
    DANGEROUS_ACTIONS.includes(action)
  ) {
    return {
      approved: false,
      needsConfirmation: true,
      reason: action
    };
  }

  return {
    approved: true
  };
}

function validateCommand(parsed) {

  if (!parsed) {
    return {
      approved: true
    };
  }

  // chat messages
  if (parsed.type === "chat") {
    return {
      approved: true
    };
  }

  // preset action
  if (parsed.type === "preset") {
    return checkAction(
      parsed.action,
      parsed.target || ""
    );
  }

  // multi-step plan
  if (parsed.type === "plan") {

    for (const step of parsed.steps || []) {

      const result = checkAction(
        step.action,
        step.target || ""
      );

      if (!result.approved) {
        return result;
      }
    }
  }

  return {
    approved: true
  };
}

module.exports = validateCommand;