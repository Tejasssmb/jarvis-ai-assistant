/**
 * integrationActions.js — connects the AI's commands to the email / WhatsApp services.
 *
 *   {"type":"preset","action":"read_emails",   "target":"unread|latest", "query":"sender or subject (optional)"}
 *   {"type":"preset","action":"read_whatsapp", "target":"contact (optional)"}
 *   {"type":"preset","action":"send_whatsapp", "target":"contact", "query":"message text"}
 */
const email = require("./emailService");
const whatsapp = require("./whatsappService");

const ACTIONS = new Set(["read_emails", "read_whatsapp", "send_whatsapp"]);

function handles(action) {
  return ACTIONS.has(action);
}

async function run(parsed) {
  const target = String(parsed.target || "").trim();
  const query = String(parsed.query || "").trim();

  try {
    switch (parsed.action) {
      case "read_emails":
        if (query) return await email.readEmail(query);
        return await email.unreadSummary(target.toLowerCase() === "latest" ? "latest" : "unread");

      case "read_whatsapp":
        return await whatsapp.readChat(target || query);

      case "send_whatsapp":
        return await whatsapp.sendMessage(target, query);

      default:
        return { display: "I don't know how to do that yet, sir.", speech: "I don't know how to do that yet, sir." };
    }
  } catch (err) {
    const text = `Something went wrong, sir. ${err.message}`;
    return { display: text, speech: text };
  }
}

/**
 * Before asking "Shall I send ...?": resolve who it would go to.
 *   -> { ok: true, name }                       exactly one matching contact
 *   -> { ok: false, display, speech, ... }      not connected / unknown / ambiguous: say that instead of asking
 */
async function prepareSend(parsed) {
  const target = String(parsed.target || "").trim();
  const text = String(parsed.query || "").trim();
  if (!target || !text) {
    const t = "I need both a contact and a message to send, sir.";
    return { ok: false, display: t, speech: t };
  }
  try {
    return await whatsapp.resolveContact(target);
  } catch (err) {
    const t = `I couldn't check your WhatsApp contacts, sir. ${err.message}`;
    return { ok: false, display: t, speech: "I couldn't check your WhatsApp contacts, sir.", longform: true };
  }
}

module.exports = { handles, run, prepareSend };
