const { callAI, beautifyReply } = require("./aiService");
const buildSystemPrompt = require("./systemPromptService");
const parseCommand = require("./parserService");
const executeCommand = require("./commandExecutor");
const validatePlan = require("./planValidator");
const {
  setPendingAction,
  getPendingAction,
  clearPendingAction
} = require("./confirmationState");

async function processCommand(userMessage, history = []) {
  const pending = getPendingAction();

if (
  pending &&
  ["yes", "y", "proceed", "continue", "ok", "okay"].includes(
   userMessage.toLowerCase().trim()
  )
) {
  clearPendingAction();

  const result = await executeCommand(pending);

  return {
    reply: result.action,
    rawReply: "CONFIRMED",
    parsed: pending,
    imageUrl: result.imageUrl || null
  };
}
if (
  pending &&
  ["no", "cancel", "stop"].includes(
    userMessage.toLowerCase().trim()
  )
) {
  clearPendingAction();

  return {
    reply: "Cancelled, sir.",
    rawReply: "CANCELLED",
    parsed: null,
    imageUrl: null
  };
}
  const systemPrompt = await buildSystemPrompt();

  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...history,
    {
      role: "user",
      content: userMessage,
    },
  ];
 
  const rawReply = await callAI(messages);
  console.log("RAW AI RESPONSE:\n", rawReply);
console.log("================================");

  const { hasCommand, parsed, cleanReply } = parseCommand(rawReply);
  console.log("PARSED:", JSON.stringify(parsed, null, 2));
  
  if (parsed?.type === "chat") {
  return {
    reply: cleanReply || rawReply,
    rawReply,
    parsed,
    imageUrl: null,
  };
}
  let finalReply = cleanReply || rawReply;
  console.log("CLEAN REPLY:", cleanReply);
console.log("RAW REPLY:", rawReply);
console.log("INITIAL FINAL REPLY:", finalReply);
  let imageUrl = null;

  if (hasCommand && parsed) {
    if (parsed.type === "plan") {
      console.log("PLAN BEFORE VALIDATION:", parsed);

  const validation = validatePlan(parsed);
  if (!validation.approved) {
    setPendingAction(parsed);
    console.log("PENDING SAVED:", getPendingAction());
    return {
      reply: validation.needsConfirmation
        ? `This action may be risky, sir. Shall I proceed?`
        : `Plan rejected, sir. ${validation.reason}`,
      rawReply,
      parsed,
      imageUrl: null
    };
  }
}
const validation = validatePlan(parsed);
if (!validation.approved) {

  if (validation.needsConfirmation) {
    setPendingAction(parsed);

    return {
      reply: "This action may be risky, sir. Shall I proceed?",
      rawReply,
      parsed,
      imageUrl: null
    };
  }

  return {
    reply: `Plan rejected, sir. ${validation.reason}`,
    rawReply,
    parsed,
    imageUrl: null
  };
}

console.log("EXECUTING:", parsed);
    const result = await executeCommand(parsed);
   console.log("EXECUTION RESULT:", result);
    imageUrl = result.imageUrl || null;
    const actionResult = result.action;
    const infoActions = [
  "battery",
  "cpu",
  "ram",
  "disk",
  "network",
  "ip_address",
  "clipboard_read",
  "brightness",
  "running_apps",
  "close_app",
  "find_file",
  "screenshot",
  "volume_up",
  "volume_down",
  "current_time",
"current_date",
"current_day",
"internet_speed",
"current_wifi",
"list_wifi_networks",
"cpu_temperature",
"gpu_usage",
"gpu_memory",
"public_ip",
];

    if (parsed.type === "plan") {
  finalReply = actionResult;
}
else if (infoActions.includes(parsed.action)) {
  finalReply = actionResult;
}
else {
  finalReply = cleanReply || actionResult;
}
  }
 if (
  parsed &&
  finalReply &&
  typeof finalReply === "string"
) {
  finalReply = await beautifyReply(finalReply);
}
console.log("FINAL REPLY:", finalReply);
console.log("RETURNING:", {
  reply: finalReply,
  imageUrl
});
  return {
    reply: finalReply,
    rawReply,
    parsed,
    imageUrl,
  };
}

module.exports = processCommand;