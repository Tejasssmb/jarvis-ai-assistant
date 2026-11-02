/**
 * emailService.js — read-only Gmail access over IMAP.
 *
 * Uses EMAIL_USER / EMAIL_PASS from server/.env. For Gmail that must be an
 * "App password" (Google account -> Security -> 2-Step Verification -> App passwords)
 * and IMAP must be switched on (Gmail -> Settings -> Forwarding and POP/IMAP).
 *
 * Every function returns { display, speech }:
 *   display = full text for the Chat page
 *   speech  = the short version Jarvis says out loud
 */
const { simpleParser } = require("mailparser");

let ImapFlow = null;
try {
  ({ ImapFlow } = require("imapflow"));
} catch {
  /* not installed: configured() / the helpers below explain what to do */
}

const HOST = process.env.IMAP_HOST || "imap.gmail.com";

// replaceable in tests
let factory = (options) => {
  if (!ImapFlow) throw new Error("The email package isn't installed. Run npm install in the server folder.");
  return new ImapFlow(options);
};
function _setFactory(f) {
  factory = f;
}

function configured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function say(text) {
  return { display: text, speech: text };
}

function problem(err) {
  const msg = String((err && (err.responseText || err.message)) || err).replace(/\s+/g, " ").slice(0, 500);
  console.error("⚠️ Email error:", (err && err.stack) || err);
  if (/AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(msg)) {
    return say(
      "I couldn't sign in to your email, sir. Check EMAIL_USER and the app password in the server .env file, and that IMAP is switched on in Gmail."
    );
  }
  return {
    display: `I couldn't reach your email, sir.\nDetails: ${msg}`,
    speech: "I couldn't reach your email, sir. The details are in the Chat window.",
    longform: true,
  };
}

function clean(text, max) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function senderOf(addresses) {
  const a = addresses && addresses[0];
  if (!a) return "an unknown sender";
  return a.name || a.address || "an unknown sender";
}

async function withInbox(fn) {
  const client = factory({
    host: HOST,
    port: 993,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: String(process.env.EMAIL_PASS || "").replace(/\s+/g, ""), // Google shows app passwords with spaces
    },
    logger: false,
  });
  // imapflow emits "error" events; an unhandled one would crash the whole server
  if (typeof client.on === "function") client.on("error", () => {});

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    return await fn(client);
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/** "Do I have any new email?"  mode: "unread" (default) or "latest" */
async function unreadSummary(mode = "unread") {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return say("Email isn't set up yet, sir. Add EMAIL_USER and EMAIL_PASS to the server .env file.");
  }
  try {
    return await withInbox(async (client) => {
      let seqs;
      let total;
      if (mode === "latest") {
        const exists = (client.mailbox && client.mailbox.exists) || 0;
        total = exists;
        seqs = [];
        for (let i = Math.max(1, exists - 4); i <= exists; i++) seqs.push(i);
        if (!exists) return say("Your inbox is empty, sir.");
      } else {
        const unseen = (await client.search({ seen: false })) || [];
        total = unseen.length;
        if (!total) return say("You have no unread emails, sir.");
        seqs = unseen.slice(-5);
      }

      const items = [];
      for await (const msg of client.fetch(seqs, { envelope: true, uid: true })) {
        items.push({
          from: senderOf(msg.envelope && msg.envelope.from),
          subject: (msg.envelope && msg.envelope.subject) || "no subject",
        });
      }
      items.reverse(); // newest first

      const head = mode === "latest" ? "Your latest emails:" : `You have ${total} unread email${total === 1 ? "" : "s"}. The latest:`;
      const display = [head, ...items.map((m, i) => `${i + 1}. ${m.from} — ${m.subject}`)].join("\n");
      const spoken = items
        .slice(0, 3)
        .map((m) => `from ${m.from}, ${m.subject}`)
        .join(". ");
      const speech =
        mode === "latest"
          ? `Your latest emails are ${spoken}.`
          : `You have ${total} unread email${total === 1 ? "" : "s"}. The latest are ${spoken}.`;
      return { display, speech };
    });
  } catch (err) {
    return problem(err);
  }
}

/** "Read the email from Amazon"  — finds the newest match by sender or subject */
async function readEmail(query) {
  const q = String(query || "").trim();
  if (!q) return unreadSummary("unread");
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return say("Email isn't set up yet, sir. Add EMAIL_USER and EMAIL_PASS to the server .env file.");
  }
  try {
    return await withInbox(async (client) => {
      let seqs = (await client.search({ or: [{ from: q }, { subject: q }] })) || [];
      if (!seqs.length) seqs = (await client.search({ body: q })) || [];
      if (!seqs.length) return say(`I couldn't find an email matching "${q}", sir.`);

      const seq = seqs[seqs.length - 1]; // newest match
      const msg = await client.fetchOne(String(seq), { envelope: true, source: { maxLength: 200000 } });
      const parsed = await simpleParser(msg.source);

      const from = senderOf(msg.envelope && msg.envelope.from);
      const subject = (msg.envelope && msg.envelope.subject) || "no subject";
      const when = msg.envelope && msg.envelope.date ? new Date(msg.envelope.date).toLocaleString("en-IN") : "";
      const body = clean(parsed.text || htmlToText(parsed.html), 1800) || "(this email has no readable text)";

      const display = [`From: ${from}`, `Subject: ${subject}`, when ? `Date: ${when}` : "", "", body]
        .filter((l, i) => l !== "" || i === 3)
        .join("\n");
      const speech = `Email from ${from}. Subject: ${subject}. ${clean(body, 420)}`;
      return { display, speech };
    });
  } catch (err) {
    return problem(err);
  }
}

module.exports = { unreadSummary, readEmail, configured, _setFactory };
