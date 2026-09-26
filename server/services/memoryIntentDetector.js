const { callAI } = require("./aiService");

async function detectMemoryIntent(message) {

  const result = await callAI([
    {
      role: "system",
      content: `
Classify the user request.

Return ONLY one:

memory_search
normal_chat

Examples:

"What do you remember about me?"
memory_search

"What are my goals?"
memory_search

"What projects am I working on?"
memory_search

"What is my favorite language?"
memory_search

"Open Chrome"
normal_chat

"Tell me a joke"
normal_chat
`
    },
    {
      role: "user",
      content: message
    }
  ]);

  return result.trim().toLowerCase();
}

module.exports = detectMemoryIntent;