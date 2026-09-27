const { callAI } = require("./aiService");

async function shouldStoreMemory(message) {

  const result = await callAI([
    {
      role: "system",
      content: `
You decide whether a message should become memory.

Return ONLY:

store

or

ignore

Store ONLY if the message teaches a fact about the user.

Examples:

I like Python
store

My project is Jarvis
store

My father is Prakash
store

We are a family of four
store

What do you know about my family?
ignore

What projects am I working on?
ignore

Hello Jarvis
ignore
`
    },
    {
      role: "user",
      content: message
    }
  ]);

  return result.trim().toLowerCase();
}

module.exports = shouldStoreMemory;