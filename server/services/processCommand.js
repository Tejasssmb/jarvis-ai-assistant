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
const Memory = require("../models/Memory");
const detectMemoryIntent =
require("./memoryIntentDetector");
const searchRelevantMemories =
require("./memorySearch");
async function processCommand(userMessage, history = [], mobileSocket = null) {
  const intent =
  await detectMemoryIntent(userMessage);
  if (intent === "memory_search") {

 const memoryContext =
  await searchRelevantMemories(
    userMessage
  );
  const reply = await callAI([
    {
      role: "system",
      content: `
Answer ONLY using the user's memories.

If the answer is not present,
say you do not remember that yet.

USER MEMORIES:

${memoryContext}
`
    },
    {
      role: "user",
      content: userMessage
    }
  ]);

  return {
    reply,
    rawReply: reply,
    parsed: { type: "chat" },
    imageUrl: null
  };
}
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

  const lower = userMessage.toLowerCase();

if (
  lower.includes("what do you remember about me") ||
  lower.includes("what do you know about me")
) {
  const memories = await Memory.find({
    type: { $ne: "conversation" }
  });

  return {
    reply: memories.map(m => m.content).join("\n"),
    rawReply: "MEMORY_RECALL",
    parsed: { type: "chat" },
    imageUrl: null
  };
}

if (lower.includes("my goals")) {
  const goals = await Memory.find({
    type: "goal"
  });

  return {
    reply: goals.map(g => g.content).join("\n"),
    rawReply: "GOAL_RECALL",
    parsed: { type: "chat" },
    imageUrl: null
  };
}

if (lower.includes("my projects")) {
  const projects = await Memory.find({
    type: "project"
  });

  return {
    reply: projects.map(p => p.content).join("\n"),
    rawReply: "PROJECT_RECALL",
    parsed: { type: "chat" },
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
  
  let query = {
  type: { $ne: "conversation" }
};

const lowerMessage = userMessage.toLowerCase();

if (lowerMessage.includes("project")) {
  query.type = "project";
}
else if (
  lowerMessage.includes("favorite") ||
  lowerMessage.includes("like")
) {
  query.type = "preference";
}
else if (
  lowerMessage.includes("name") ||
  lowerMessage.includes("who am i")
) {
  query.type = "profile";
}

const memories = await Memory
  .find(query)
  .sort({ createdAt: -1 })
  .limit(10);

const memoryContext = memories
  .map(m => m.content)
  .join("\n");

messages.splice(1, 0, {
  role: "system",
  content: `USER MEMORIES:\n${memoryContext}`
});

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