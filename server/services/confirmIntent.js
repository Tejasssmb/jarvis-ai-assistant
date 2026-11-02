/**
 * confirmIntent.js - is this spoken sentence a "yes" or a "no" to a question Jarvis just asked?
 *
 * Speech-to-text writes "Yes." / "Yeah, go ahead." / "No, cancel that." - with capitals and
 * punctuation - so an exact string match ("yes") never matched what you actually said.
 *
 *   classifyConfirmation("Yes, please.")  -> "yes"
 *   classifyConfirmation("Cancel that.")  -> "no"
 *   classifyConfirmation("What time is it?") -> null   (not an answer)
 */
const YES = new Set([
  "yes", "y", "yeah", "yep", "yup", "ya", "yes please", "yes sir", "yes jarvis", "sure", "sure thing", "ok", "okay", "okey",
  "k", "go ahead", "go on", "do it", "send it", "please do", "proceed", "continue", "confirm", "confirmed", "correct",
  "right", "that is right", "thats right", "absolutely", "definitely", "of course", "affirmative", "please", "sounds good",
  "alright", "all right", "yes go ahead", "yeah go ahead", "yes do it", "yes send it", "yes confirm", "yes proceed",
]);

const NO = new Set([
  "no", "n", "nope", "nah", "cancel", "stop", "dont", "do not", "never mind", "nevermind", "no thanks", "no thank you",
  "negative", "abort", "not now", "no sir", "no jarvis", "forget it", "leave it", "cancel that", "stop it", "dont send it",
  "do not send it", "dont do it", "no dont", "no cancel", "no stop",
]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/'/g, "")                 // don't -> dont
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyConfirmation(text) {
  let n = normalize(text);
  if (!n) return null;
  n = n.replace(/^(hey |ok |okay )?jarvis /, "").replace(/ (sir|jarvis|please)$/, (m) => (m === " please" && YES.has(n) ? m : "")).trim();
  if (YES.has(n)) return "yes";
  if (NO.has(n)) return "no";

  const words = n.split(" ");
  if (words.length <= 4) {
    if (/^(no|nope|nah|cancel|stop|dont|do not|never mind|nevermind)\b/.test(n)) return "no";
    if (/^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|send it|proceed|confirm|please do)\b/.test(n)) return "yes";
  }
  return null;
}

module.exports = { classifyConfirmation, normalize };
