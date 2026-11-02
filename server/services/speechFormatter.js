/**
 * speechFormatter.js
 *
 * Turns an LLM reply into what Jarvis should actually SAY.
 * The full reply still goes to the chat screen untouched; only the
 * spoken version is trimmed.
 *
 *   toSpeech(reply) -> { speech, hasCode, truncated }
 *
 * Rules:
 *  - Reply contains a code block  -> say the intro sentence(s) before the
 *    code, then "I've put the code on your screen, sir." Nothing else.
 *  - Markdown, URLs, paths, JSON, tables, emoji and stray symbols are removed.
 *  - Long replies are cut on a sentence boundary (maxChars) and Jarvis says
 *    the rest is on screen.
 */

const CODE_SPOKEN = "I've put the code on your screen, sir.";
const MORE_ON_SCREEN = "The rest is on your screen, sir.";

function clean(input) {
  let t = String(input || "").replace(/\r/g, "");

  // Tables, horizontal rules, lone brackets, "key": value lines
  t = t
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      if (/^\|.*\|$/.test(s)) return false;
      if (/^[-=_*]{3,}$/.test(s)) return false;
      if (/^[\[\]{},]+$/.test(s)) return false;
      if (/^"[\w-]+"\s*:/.test(s)) return false;
      return true;
    })
    .join("\n");

  // Links, URLs, Windows paths, html tags
  t = t.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
  t = t.replace(/https?:\/\/\S+/gi, "");
  t = t.replace(/[A-Za-z]:\\[^\s,;?!]*[\w)]/g, "the file");
  t = t.replace(/<[^>]+>/g, " ");

  // Inline code: short snippets are read, long ones are dropped
  t = t.replace(/`([^`]*)`/g, (_, inner) => (inner.length <= 25 ? inner : ""));

  // Markdown decoration and list markers
  t = t
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "");

  // Emoji
  t = t.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");

  // Say a few symbols out loud, drop everything else that isn't speakable
  t = t
    .replace(/&/g, " and ")
    .replace(/%/g, " percent")
    .replace(/₹/g, " rupees ")
    .replace(/\$/g, " dollars ")
    .replace(/@/g, " at ")
    .replace(/\+/g, " plus ")
    .replace(/→|->|=>/g, " to ")
    .replace(/\//g, " or ");
  t = t.replace(/[^\p{L}\p{N}\s.,!?'’:;]/gu, " ");

  // Tidy punctuation and whitespace
  t = t
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/([.,!?;:])(\s*[.,;:])+/g, "$1")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/^[\s.,;:]+/, "")
    .trim();

  return t;
}

function cap(text, maxChars) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  let out = "";
  let truncated = false;
  for (const s of sentences) {
    if (out && (out + s).length > maxChars) {
      truncated = true;
      break;
    }
    out += s;
  }
  return { text: out.trim(), truncated };
}

function toSpeech(reply, { maxChars = 320 } = {}) {
  if (!reply || typeof reply !== "string") {
    return { speech: "", hasCode: false, truncated: false };
  }

  const fenceAt = reply.indexOf("```");
  const hasCode = fenceAt !== -1;

  if (hasCode) {
    let intro = clean(reply.slice(0, fenceAt)).replace(/[:,;]\s*$/, ".");
    intro = cap(intro, maxChars).text;
    return {
      speech: (intro ? intro + " " : "") + CODE_SPOKEN,
      hasCode: true,
      truncated: true,
    };
  }

  const { text, truncated } = cap(clean(reply), maxChars);
  return {
    speech: truncated ? `${text} ${MORE_ON_SCREEN}` : text,
    hasCode: false,
    truncated,
  };
}

module.exports = { toSpeech };
