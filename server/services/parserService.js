function parseCommand(reply) {
  const startIdx = reply.indexOf("JARVIS_CMD:");

  if (startIdx === -1) {
    return {
      hasCommand: false,
      parsed: null,
      cleanReply: reply,
    };
  }

  const braceStart = reply.indexOf("{", startIdx);

  if (braceStart === -1) {
    return {
      hasCommand: false,
      parsed: null,
      cleanReply: reply,
    };
  }

  let depth = 0;
  let endIdx = -1;

  for (let i = braceStart; i < reply.length; i++) {
    if (reply[i] === "{") depth++;
    if (reply[i] === "}") depth--;

    if (depth === 0) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return {
      hasCommand: false,
      parsed: null,
      cleanReply: reply,
    };
  }

  let jsonStr = reply.slice(braceStart, endIdx + 1);

  jsonStr = jsonStr
    .replace(/\)$/, "}")
    .replace(/,$/, "");

  try {
    const parsed = JSON.parse(jsonStr);

    const cleanReply = (
      reply.slice(0, startIdx) +
      reply.slice(endIdx + 1)
    )
      .replace(/\s+/g, " ")
      .trim();

    return {
      hasCommand: true,
      parsed,
      cleanReply,
    };
  } catch {
    return {
      hasCommand: false,
      parsed: null,
      cleanReply: reply,
    };
  }
}

module.exports = parseCommand;