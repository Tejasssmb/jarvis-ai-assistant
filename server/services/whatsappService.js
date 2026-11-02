/* global window */
/**
 * whatsappService.js — read and send WhatsApp messages by voice.
 *
 * Uses the unofficial "whatsapp-web.js" library: it drives a hidden Chrome that is
 * logged in to WhatsApp Web with YOUR account (link it once by scanning a QR code,
 * the session is then remembered in server/.wwebjs_auth).
 * Note: this is not an official WhatsApp API; use it for your own account only.
 *
 * Turn it on by adding   WHATSAPP_ENABLED=true   to server/.env  (and run npm install).
 * Sending asks "Shall I send ...?" first, unless you add   WHATSAPP_AUTO_SEND=true
 *
 * Every function returns { display, speech } like emailService.
 */
const fs = require("fs");
const path = require("path");

let wa = null;
try {
  wa = require("whatsapp-web.js");
} catch {
  /* not installed: status() explains what to do */
}

const PORT = process.env.PORT || 5000;
const QR_URL = `http://localhost:${PORT}/api/integrations/whatsapp/qr`;

const S = { status: "off", qr: null, error: null, client: null };

function say(text) {
  return { display: text, speech: text };
}

function enabled() {
  return process.env.WHATSAPP_ENABLED === "true";
}

function findChrome() {
  if (process.env.WHATSAPP_CHROME_PATH) return process.env.WHATSAPP_CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function start() {
  if (!enabled() || S.client) return;
  if (!wa) {
    S.status = "error";
    S.error = "whatsapp-web.js is not installed. Run npm install in the server folder.";
    console.error("⚠️ WhatsApp:", S.error);
    return;
  }

  S.status = "starting";
  S.error = null;
  const executablePath = findChrome();
  const client = new wa.Client({
    authStrategy: new wa.LocalAuth({ dataPath: path.join(__dirname, "..", ".wwebjs_auth") }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    },
  });

  client.on("qr", (qr) => {
    S.qr = qr;
    S.status = "qr";
    console.log(`📱 WhatsApp needs linking. Open ${QR_URL} and scan the code with your phone.`);
  });
  client.on("authenticated", () => {
    S.qr = null;
    S.status = "authenticated";
  });
  client.on("ready", () => {
    S.qr = null;
    S.status = "ready";
    console.log("✅ WhatsApp connected");
  });
  client.on("auth_failure", (m) => {
    S.status = "error";
    S.error = `WhatsApp login failed: ${m}`;
    console.error("⚠️", S.error);
  });
  client.on("disconnected", (reason) => {
    S.status = "disconnected";
    S.error = `WhatsApp disconnected: ${reason}`;
    S.client = null;
    console.error("⚠️", S.error);
  });

  S.client = client;
  client.initialize().catch((err) => {
    S.status = "error";
    S.error = err.message;
    S.client = null;
    console.error("⚠️ WhatsApp could not start:", err.message);
  });
}

function status() {
  return { enabled: enabled(), status: S.status, hasQr: Boolean(S.qr), qr: S.qr, error: S.error };
}

/** null when ready, otherwise the sentence Jarvis should say instead */
function notReady() {
  if (!enabled() && !S.client) {
    return "WhatsApp isn't switched on, sir. Add WHATSAPP_ENABLED=true to the server .env file, run npm install, and restart me.";
  }
  if (S.status === "qr") {
    return `WhatsApp needs linking first, sir. Open ${QR_URL} and scan the code with your phone.`;
  }
  if (S.status === "error") return `WhatsApp isn't working, sir. ${S.error || ""}`.trim();
  if (S.status !== "ready") return "WhatsApp is still connecting, sir. Try again in a few seconds.";
  return null;
}

function withTimeout(promise, ms, what) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ---------------------------------------------------------------- matching
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Rough "how it sounds" key. Speech-to-text spells names its own way (Nayana / Nayna / Naina),
 * so names that sound alike get the same key: first letter + consonants, similar sounds merged.
 */
function phonetic(word) {
  let w = norm(word).replace(/ /g, "");
  if (!w) return "";
  w = w
    .replace(/ph/g, "f").replace(/sh/g, "s").replace(/ch/g, "c").replace(/th/g, "t").replace(/dh/g, "d")
    .replace(/bh/g, "b").replace(/gh/g, "g").replace(/kh/g, "k").replace(/ck/g, "k")
    .replace(/q/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/w/g, "v").replace(/c(?=[aou])/g, "k");
  w = w.replace(/(.)\1+/g, "$1");                       // doubled letters first: "anna" -> "ana"
  return w[0] + w.slice(1).replace(/[aeiouy]/g, "");     // then keep the first letter + the consonants
}

function scoreName(name, query) {
  const n = norm(name);
  const q = norm(query);
  if (!n || !q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const words = n.split(" ");
  if (words.some((w) => w.startsWith(q))) return 70;
  if (n.includes(q)) return 60;
  const qs = q.split(" ");
  if (qs.every((t) => words.some((w) => w.startsWith(t)))) return 50;

  // sounds-like matches (only when every spoken word matches some word of the name)
  let worst = 100;
  for (const t of qs) {
    let best = 0;
    for (const w of words) {
      if (Math.min(w.length, t.length) < 3) continue;
      const sim = 1 - lev(w, t) / Math.max(w.length, t.length);
      if (sim >= 0.78) best = Math.max(best, 55);
      else if (phonetic(w) === phonetic(t) && phonetic(t).length >= 2) best = Math.max(best, 48);
    }
    worst = Math.min(worst, best);
    if (!worst) return 0;
  }
  return worst;
}

/** "Did you mean ...?" - chats whose name is at least roughly like what was said */
function suggest(chats, query, limit = 3) {
  const q = norm(query);
  if (!q) return [];
  const scored = chats
    .map((c) => {
      const words = norm(c.name).split(" ").filter(Boolean);
      const best = Math.max(0, ...words.map((w) => (Math.min(w.length, q.length) < 2 ? 0 : 1 - lev(w, q.split(" ")[0]) / Math.max(w.length, q.length))));
      return { name: c.name, best, t: c.timestamp || 0 };
    })
    .filter((x) => x.best >= 0.5)
    .sort((a, b) => b.best - a.best || b.t - a.t);
  const seen = new Set();
  return scored.filter((x) => !seen.has(norm(x.name)) && seen.add(norm(x.name))).slice(0, limit).map((x) => x.name);
}

/**
 * -> { chat }                 one clear winner
 *    { ambiguous: [names] }   several equally good matches (ask which one)
 *    {}                       nothing matches
 */
function findChat(chats, query) {
  const scored = chats
    .map((chat) => ({ chat, score: scoreName(chat.name, query) }))
    .filter((x) => x.score >= 48)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.chat.isGroup) - Number(b.chat.isGroup) || // people before groups
        (b.chat.timestamp || 0) - (a.chat.timestamp || 0)
    );
  if (!scored.length) return {};
  const top = scored[0];
  const rivals = scored.filter(
    (x) => x.score === top.score && Number(x.chat.isGroup) === Number(top.chat.isGroup) && norm(x.chat.name) !== norm(top.chat.name)
  );
  if (rivals.length && top.score < 100) {
    return { ambiguous: [top, ...rivals].slice(0, 3).map((x) => x.chat.name) };
  }
  return { chat: top.chat };
}

function bodyOf(m) {
  if (m.body && m.body.trim()) return m.body.trim().replace(/\s+/g, " ");
  const kinds = { image: "a photo", video: "a video", audio: "a voice message", ptt: "a voice message", document: "a document", sticker: "a sticker" };
  return `[${kinds[m.type] || "a " + (m.type || "message")}]`;
}

const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// ---------------------------------------------------------------- reliability helpers
let RETRY_DELAY = 2000;

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, RETRY_DELAY)); // right after linking, WhatsApp may still be syncing
    }
  }
  throw last;
}

/** A failure that shows the REAL reason (full text goes to the Chat page and the server log). */
function fail(prefix, err) {
  const detail = String((err && err.message) || err || "unknown error").replace(/\s+/g, " ").slice(0, 600);
  console.error(`⚠️ ${prefix}:`, (err && err.stack) || err);
  return {
    display: `${prefix}, sir.\nDetails: ${detail}\n(More: logs\\server.log, or open http://localhost:${PORT}/api/integrations/whatsapp/diagnose)`,
    speech: `${prefix}, sir. The details are in the Chat window.`,
    longform: true,
  };
}

/**
 * Minimal chat list read straight from the WhatsApp Web page. Used when the library's
 * getChats() breaks (it does, now and then, after WhatsApp updates its website).
 */
async function basicChatList() {
  const raw = await S.client.pupPage.evaluate(() => {
    const col = (window.require && window.require("WAWebCollections")) || window.Store;
    return col.Chat.getModelsArray().map((c) => ({
      id: c.id._serialized,
      name: c.formattedTitle || c.name || (c.contact && (c.contact.name || c.contact.pushname)) || (c.id && c.id.user) || "unknown",
      isGroup: !!c.isGroup,
      unreadCount: c.unreadCount || 0,
      timestamp: c.t || 0,
    }));
  });
  return raw.map((c) => ({ ...c, id: { _serialized: c.id }, basic: true }));
}

async function pageMessages(chatId, limit) {
  return S.client.pupPage.evaluate(
    (id, n) => {
      const col = (window.require && window.require("WAWebCollections")) || window.Store;
      const chat = col.Chat.getModelsArray().find((c) => c.id._serialized === id);
      if (!chat || !chat.msgs) return [];
      return chat.msgs.getModelsArray().slice(-n).map((m) => ({
        fromMe: !!(m.id && m.id.fromMe),
        body: m.body || "",
        type: m.type || "chat",
        timestamp: m.t || 0,
      }));
    },
    chatId,
    limit
  );
}

const canUsePage = () => Boolean(S.client && S.client.pupPage && typeof S.client.pupPage.evaluate === "function");

// Chats are cached briefly so "yes" (a few seconds after the question) does not reload 500 chats
let chatCache = { at: 0, chats: null, basic: false };
const CACHE_MS = 20000;

/**
 * The library's getChats() is all-or-nothing: ONE chat that cannot be read (a group or community
 * whose details will not load) makes the whole call fail with a cryptic error like "r".
 * This does the same job chat by chat inside the page, skips the broken ones, and keeps the rest.
 */
async function resilientChats() {
  const result = await S.client.pupPage.evaluate(async () => {
    const col = (window.require && window.require("WAWebCollections")) || window.Store;
    const models = col.Chat.getModelsArray();
    const ok = [];
    const failed = [];
    for (let i = 0; i < models.length; i += 20) {
      await Promise.all(
        models.slice(i, i + 20).map(async (chat) => {
          try {
            const m = await window.WWebJS.getChatModel(chat);
            if (m) ok.push(m);
          } catch (e) {
            failed.push({ id: chat && chat.id && chat.id._serialized, error: String((e && e.message) || e) });
          }
        })
      );
    }
    return { ok, failed };
  });

  const ChatFactory = require("whatsapp-web.js/src/factories/ChatFactory");
  const chats = [];
  for (const data of result.ok) {
    try {
      chats.push(ChatFactory.create(S.client, data));
    } catch (e) {
      result.failed.push({ id: data && data.id && data.id._serialized, error: String((e && e.message) || e) });
    }
  }
  if (result.failed.length) {
    console.error(`⚠️ WhatsApp: ${result.failed.length} of ${chats.length + result.failed.length} chats could not be read and were skipped. First error: ${result.failed[0].error}`);
  }
  return { chats, skipped: result.failed };
}

async function loadChats() {
  if (chatCache.chats && Date.now() - chatCache.at < CACHE_MS) {
    return { chats: chatCache.chats, basic: chatCache.basic, cached: true };
  }
  let out = null;

  // 1) chat by chat, skipping any broken chat
  if (canUsePage()) {
    try {
      const r = await withRetry(() => withTimeout(resilientChats(), 45000, "Loading chats"), 2);
      if (r.chats.length) out = { chats: r.chats, basic: false, skipped: r.skipped.length };
    } catch (err) {
      console.error("⚠️ WhatsApp per-chat loading failed:", (err && err.stack) || err);
    }
  }
  // 2) the library's own getChats()
  if (!out) {
    try {
      out = { chats: await withRetry(() => withTimeout(S.client.getChats(), 30000, "Loading chats")), basic: false };
    } catch (err) {
      console.error("⚠️ WhatsApp getChats() failed:", (err && err.stack) || err);
      // 3) names + unread counts straight from the page
      if (canUsePage()) {
        try {
          const chats = await basicChatList();
          if (chats.length) out = { chats, basic: true, error: err };
        } catch (err2) {
          console.error("⚠️ The basic chat list failed as well:", (err2 && err2.stack) || err2);
        }
      }
      if (!out) throw err;
    }
  }
  chatCache = { at: Date.now(), chats: out.chats, basic: out.basic };
  return out;
}

async function messagesOf(chat, limit) {
  if (!chat.basic) {
    try {
      return await withTimeout(chat.fetchMessages({ limit }), 15000, "Reading chat");
    } catch (err) {
      if (!canUsePage()) throw err;
      console.error("⚠️ fetchMessages failed, reading from the page instead:", (err && err.stack) || err);
    }
  }
  return withTimeout(pageMessages(chat.id._serialized, limit), 15000, "Reading chat");
}

// ---------------------------------------------------------------- actions
/** "Any WhatsApp messages?" */
async function unreadSummary() {
  const blocked = notReady();
  if (blocked) return say(blocked);
  try {
    const { chats } = await loadChats();
    const unread = chats
      .filter((c) => c.unreadCount > 0)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 8);
    if (!unread.length) return say("You have no unread WhatsApp messages, sir.");

    const lines = [];
    const spoken = [];
    for (const chat of unread) {
      let last = "";
      try {
        const msgs = await messagesOf(chat, Math.min(chat.unreadCount, 3));
        last = msgs.length ? bodyOf(msgs[msgs.length - 1]) : "";
      } catch {
        last = chat.lastMessage ? bodyOf(chat.lastMessage) : "";
      }
      const n = chat.unreadCount;
      lines.push(`${chat.name} (${n} new)${last ? ": " + short(last, 120) : ""}`);
      if (spoken.length < 3) spoken.push(`${chat.name} sent ${n === 1 ? "a message" : n + " messages"}${last ? ", saying " + short(last, 80) : ""}`);
    }
    const total = unread.reduce((s, c) => s + c.unreadCount, 0);
    return {
      display: [`${total} unread WhatsApp message${total === 1 ? "" : "s"} in ${unread.length} chat${unread.length === 1 ? "" : "s"}:`, ...lines].join("\n"),
      speech: `You have ${total} unread WhatsApp message${total === 1 ? "" : "s"}. ${spoken.join(". ")}.`,
    };
  } catch (err) {
    return fail("I couldn't read your WhatsApp", err);
  }
}

/** "Read my WhatsApp from Mom" */
async function readChat(query) {
  const blocked = notReady();
  if (blocked) return say(blocked);
  if (!String(query || "").trim()) return unreadSummary();
  try {
    const { chats } = await loadChats();
    const found = findChat(chats, query);
    if (found.ambiguous) return say(`I found more than one match for ${query}, sir: ${found.ambiguous.join(", or ")}. Which one?`);
    if (!found.chat) {
      const maybe = suggest(chats, query);
      return say(`I couldn't find a WhatsApp chat called ${query}, sir.${maybe.length ? ` Did you mean ${maybe.join(", or ")}?` : ""}`);
    }

    const chat = found.chat;
    const msgs = await messagesOf(chat, 8);
    if (!msgs.length) return say(`There are no messages in your chat with ${chat.name}, sir.`);

    const display = [`Chat with ${chat.name}:`, ...msgs.map((m) => `${m.fromMe ? "You" : chat.name}: ${bodyOf(m)}`)].join("\n");
    const incoming = msgs.filter((m) => !m.fromMe).slice(-4);
    const speech = incoming.length
      ? `${chat.name} wrote: ${incoming.map((m) => short(bodyOf(m), 160)).join(". Then: ")}`
      : `You sent the last messages to ${chat.name}; they haven't replied yet, sir.`;
    return { display, speech };
  } catch (err) {
    return fail("I couldn't read that chat", err);
  }
}

/** "Send a WhatsApp to Mom saying I'll be late" */
async function sendMessage(query, text) {
  const blocked = notReady();
  if (blocked) return say(blocked);
  const msg = String(text || "").trim();
  if (!String(query || "").trim() || !msg) return say("I need both a contact and a message to send, sir.");
  try {
    const { chats } = await loadChats();
    const found = findChat(chats, query);
    if (found.ambiguous) return say(`I found more than one match for ${query}, sir: ${found.ambiguous.join(", or ")}. Nothing was sent. Please say the full name.`);
    if (!found.chat) {
      const maybe = suggest(chats, query);
      return say(`I couldn't find ${query} in your WhatsApp, sir. Nothing was sent.${maybe.length ? ` Did you mean ${maybe.join(", or ")}?` : ""}`);
    }

    // sendSeen:false -> do not also "mark the chat as read": that extra step is what breaks
    // whenever WhatsApp Web changes, and it is not needed for sending.
    await withTimeout(S.client.sendMessage(found.chat.id._serialized, msg, { sendSeen: false }), 20000, "Sending");
    return { display: `Sent to ${found.chat.name}: ${msg}`, speech: `Message sent to ${found.chat.name}, sir.` };
  } catch (err) {
    return fail("I couldn't send that message", err);
  }
}

/**
 * Who would a message to "nayana" go to?  Used BEFORE asking for confirmation, so the question
 * names the real contact, and a wrong / ambiguous name is reported right away.
 */
async function resolveContact(query) {
  const blocked = notReady();
  if (blocked) return { ok: false, display: blocked, speech: blocked };
  try {
    const { chats } = await loadChats();
    const found = findChat(chats, query);
    if (found.ambiguous) {
      const t = `I found more than one match for ${query}, sir: ${found.ambiguous.join(", or ")}. Nothing was sent. Please say the full name.`;
      return { ok: false, display: t, speech: t };
    }
    if (!found.chat) {
      const maybe = suggest(chats, query);
      const t = `I couldn't find ${query} in your WhatsApp, sir.${maybe.length ? ` Did you mean ${maybe.join(", or ")}?` : ""} Nothing was sent.`;
      return { ok: false, display: t, speech: t };
    }
    return { ok: true, name: found.chat.name };
  } catch (err) {
    return { ok: false, ...fail("I couldn't check your WhatsApp contacts", err) };
  }
}

/** Step-by-step self test: open http://localhost:5000/api/integrations/whatsapp/diagnose */
async function diagnose() {
  let library = "unknown";
  try {
    library = require("whatsapp-web.js/package.json").version;
  } catch {
    /* ignore */
  }
  const out = { library, enabled: enabled(), status: S.status, error: S.error, steps: [] };
  if (!S.client) return out;

  const step = async (name, fn) => {
    const t0 = Date.now();
    try {
      const result = await withTimeout(Promise.resolve().then(fn), 30000, name);
      out.steps.push({ name, ok: true, ms: Date.now() - t0, result });
    } catch (e) {
      out.steps.push({ name, ok: false, ms: Date.now() - t0, error: String((e && e.message) || e), stack: String((e && e.stack) || "").split("\n").slice(0, 6) });
    }
  };
  await step("WhatsApp Web version", () => S.client.getWWebVersion());
  await step("client.getChats() (the library's all-or-nothing call)", async () => `${(await S.client.getChats()).length} chats`);
  if (canUsePage()) {
    await step("chat by chat (skips unreadable chats)", async () => {
      const r = await resilientChats();
      return { readable: r.chats.length, skipped: r.skipped.length, firstErrors: r.skipped.slice(0, 3) };
    });
  }
  if (canUsePage()) await step("basic chat list read from the page", async () => `${(await basicChatList()).length} chats`);
  return out;
}

// test helpers
function _setClient(client, statusName = "ready") {
  S.client = client;
  S.status = statusName;
  chatCache = { at: 0, chats: null, basic: false };
}
function _setState(partial) {
  Object.assign(S, partial);
}
function _setRetryDelay(ms) {
  RETRY_DELAY = ms;
}

module.exports = { start, status, unreadSummary, readChat, sendMessage, resolveContact, diagnose, findChat, suggest, phonetic, _setClient, _setState, _setRetryDelay };
