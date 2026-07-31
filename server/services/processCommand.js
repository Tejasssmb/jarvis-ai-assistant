const callAI = require("./aiService");
const buildSystemPrompt = require("./systemPromptService");
const parseCommand = require("./parserService");
const executeCommand = require("./commandExecutor");

async function processCommand(userMessage, history = []) {

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

  const { hasCommand, parsed, cleanReply } = parseCommand(rawReply);

  let finalReply = cleanReply || rawReply;

  if (hasCommand && parsed) {
    const result = await executeCommand(parsed);

    const actionResult = result.action;

    const infoActions = [
      "battery",
      "screenshot",
      "volume_up",
      "volume_down",
    ];

    if (infoActions.includes(parsed.action)) {
      finalReply = actionResult;
    } else {
      finalReply = cleanReply || actionResult;
    }
  }

  return {
    reply: finalReply,
    rawReply,
    parsed,
  };
}

module.exports = processCommand;