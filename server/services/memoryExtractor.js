const { callAI } = require("./aiService");

async function extractMemories(message) {

  const prompt = [
    {
      role: "system",
      content: `
Extract all facts about the user.

Return ONLY a JSON array.

Example:

[
  {
    "type":"preference",
    "content":"I love Python"
  },
  {
    "type":"goal",
    "content":"My goal is to become an AI Engineer"
  }
]

Rules:
- Return valid JSON only
- Return [] if no facts exist
- Do not explain
- Do not wrap in markdown
`
    },
    {
      role: "user",
      content: message
    }
  ];

  const result = await callAI(prompt);

  try {
    return JSON.parse(result);
  } catch {
    return [];
  }
}

module.exports = extractMemories;