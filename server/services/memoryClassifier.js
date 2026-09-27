const { callAI } = require("./aiService");

async function classifyMemory(message) {
  const prompt = [
    {
      role: "system",
      content: `
Analyze the user message.

Return ONLY a short category name.

Examples:

"My father is Prakash"
family

"My sister is Nayana"
family

"I like Python"
preference

"I support RCB"
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
- lowercase only
- one word if possible
- no explanation
- no JSON
`
    },
    {
      role: "user",
      content: message
    }
  ];

  const result = await callAI(prompt);

  console.log("CLASSIFIER RAW:", result);

  return result.trim().toLowerCase();
}

async function shouldStoreMemory(message) {
  const prompt = [
    {
      role: "system",
      content: `
Decide whether this message should be stored as memory.

Return ONLY:

store

or

ignore

Store only if the message teaches a new fact about the user.

Examples:

"I like Python"
store

"My project is Jarvis"
store

"My father is Prakash"
store

"What do you know about my family?"
ignore

"What project am I working on?"
ignore

"Hi"
ignore

"Hello Jarvis"
ignore

"Thank you"
ignore

Rules:
- Return ONLY store or ignore
- No explanation
- No JSON
`
    },
    {
      role: "user",
      content: message
    }
  ];

  const result = await callAI(prompt);

  console.log("STORE RAW:", result);

  return result.trim().toLowerCase();
}

module.exports = {
  classifyMemory,
  shouldStoreMemory
};