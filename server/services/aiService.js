const ollama = require("ollama").default;
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

async function callAI(messages) {
  try {
    const response = await groq.chat.completions.create({
  model: "openai/gpt-oss-120b",
  messages,
  max_tokens: 300
});

    console.log("✅ Groq responded");
    return response.choices[0].message.content;
  } catch (err) {
    console.error("GROQ ERROR:", err.response?.data || err.message);
    console.log("⚠️ Groq failed. Switching to Ollama.");

    const response = await ollama.chat({
      model: "llama3.1",
      messages,
    });
    

    console.log("✅ Ollama responded");
    console.log(
  "CONTENT:",
  response.choices[0].message.content
);

console.log(
  "FINISH:",
  response.choices[0].finish_reason
);
    return response.message.content;
  }
}
async function beautifyReply(text) {
  try {
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
         content: `
You are Jarvis.

Rewrite the text as a natural, professional Jarvis response.

Rules:
- Maximum 8 words.
- Sound intelligent and confident.
- Never mention paths.
- Never mention filenames unless necessary.
- Never describe internal operations.
- Never explain what happened.
- Return only the spoken response.

Examples:

Folder Backup created successfully. Opened folder Backup
-> Folder ready, sir.

C:\\Users\\tejas\\Desktop\\a.txt. Opening a.txt
-> Found it, sir.

Opening chrome for you sir. Searching Google for Jarvis AI
-> Right away, sir.
`
        },
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 20
    });

    return response.choices[0].message.content.trim();
  } catch {
    return text;
  }
}

module.exports = {
  callAI,
  beautifyReply
};