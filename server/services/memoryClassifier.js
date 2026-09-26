
const { callAI } = require("./aiService");

async function classifyMemory(message) {
  const prompt = [
    {
      role: "system",
      content: `
Analyze the memory.

Return ONLY:

- a short category name
or
- none

Examples:

"My dad is Prakash"
family

"I like RCB"
sports

"I like biryani"
food

"My project is Jarvis"
project

"I want to become an AI Engineer"
career

"My college is XYZ"
education

"Hello Jarvis"
none

Rules:
- One word if possible
- lowercase only
- no explanation
- no JSON `
    },
    {
      role: "user",
      content: message
    }
  ];

  const result = await callAI(prompt);

  return result.trim().toLowerCase();
}

module.exports = classifyMemory;