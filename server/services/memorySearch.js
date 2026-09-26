const Memory = require("../models/Memory");
const { callAI } = require("./aiService");

async function searchRelevantMemories(userMessage) {

  const category = await callAI([
    {
      role: "system",
      content: `
Determine what memory category is needed.

Return ONLY one category name.

Examples:

Tell me about my family
family

What sports do I like
sports

What am I building
project

What are my goals
career
`
    },
    {
      role: "user",
      content: userMessage
    }
  ]);
  console.log(
  "MEMORY SEARCH CATEGORY:",
  category
);

  const memories = await Memory.find({
    type: category.trim().toLowerCase()
  })
  .sort({ createdAt: -1 })
  .limit(20);
   console.log(
  "FOUND MEMORIES:",
  memories.length
);
  return memories;
  
}

module.exports = searchRelevantMemories;