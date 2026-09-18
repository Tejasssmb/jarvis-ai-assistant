const {
  callAI,
  generateAcknowledgement
} = require("./aiService");
const buildSystemPrompt = require("./systemPromptService");
const parseCommand = require("./parserService");
const executeCommand = require("./commandExecutor");
const validatePlan = require("./planValidator");
const {
  setPendingAction,
  getPendingAction,
  clearPendingAction
} = require("./confirmationState");

async function processCommand(userMessage, history = [], mobileSocket = null) {
  const pending = getPendingAction();

if (
  pending &&
  ["yes", "y", "proceed", "continue", "ok", "okay"].includes(
   userMessage.toLowerCase().trim()
  )
) {
  clearPendingAction();

  const result = await executeCommand(pending);
  const acknowledgement =
  await generateAcknowledgement(
    "confirmation",
    result.action
  );

return {
  reply: acknowledgement,
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

  let imageUrl = null;

  if (hasCommand && parsed) {
    if (parsed.type === "plan") {
      
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



const result = await executeCommand(parsed);

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
 if (infoActions.includes(parsed.action)) {
  finalReply = actionResult;
}
else if (
  parsed.type === "plan" ||
  parsed.type === "preset"
) {
  finalReply = await generateAcknowledgement(
    userMessage,
    actionResult
  );
}
else {
  finalReply = cleanReply || actionResult;
}
  }
//  if (
//   parsed &&
//   finalReply &&
//   typeof finalReply === "string"
// ) {
//   console.log("BEFORE BEAUTIFY:", finalReply);
//   finalReply = await beautifyReply(finalReply);
//   console.log("AFTER BEAUTIFY:", finalReply);
// }

  return {
    reply: finalReply,
    rawReply,
    parsed,
    imageUrl,
  };
}

module.exports = processCommand;