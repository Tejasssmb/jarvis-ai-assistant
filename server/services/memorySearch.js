const Memory = require("../models/Memory");
const { callAI } = require("./aiService");

async function searchRelevantMemories(userMessage) {
const memories = await Memory.find()
  .sort({ createdAt: -1 })
  .limit(50);

const memoryText = memories
  .map(
    m => `[${m.type}] ${m.content}`
  )
  .join("\n");

const relevantMemories =
  await callAI([
    {
      role: "system",
      content: `
You are a memory retrieval system.

Given:
1. User question
2. Available memories

Return ONLY the memories relevant
to answering the question.

If nothing is relevant return:

NONE
`
    },
    {
      role: "user",
      content: `
QUESTION:
${userMessage}

MEMORIES:
${memoryText}
`
    }
  ]);

console.log(
  "RELEVANT MEMORIES:",
  relevantMemories
);

return relevantMemories;
}
module.exports = searchRelevantMemories;