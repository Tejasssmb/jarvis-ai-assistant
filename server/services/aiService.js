const ollama = require("ollama").default;
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function callAI(messages) {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 200,
    });

    console.log("✅ Groq responded");

    return response.choices[0].message.content;

  } catch (groqError) {

    console.log("⚠️ Groq failed. Switching to Ollama.");

    const response = await ollama.chat({
      model: "llama3.1",
      messages,
    });

    console.log("✅ Ollama responded");

    return response.message.content;
  }
}

module.exports = callAI;