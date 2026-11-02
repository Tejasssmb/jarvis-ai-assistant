const express = require("express");
const QRCode = require("qrcode");
const whatsapp = require("../services/whatsappService");
const email = require("../services/emailService");

const router = express.Router();

// Only this computer may use these pages (the QR code links your WhatsApp account).
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress || "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
  return res.status(403).send("local only");
}

router.get("/status", localOnly, (req, res) => {
  const w = whatsapp.status();
  res.json({
    whatsapp: { enabled: w.enabled, status: w.status, error: w.error },
    email: { configured: email.configured() },
  });
});

// Step-by-step self test of the WhatsApp connection (shows the real error if something breaks)
router.get("/whatsapp/diagnose", localOnly, async (req, res) => {
  res.json(await whatsapp.diagnose());
});

// Open http://localhost:5000/api/integrations/whatsapp/qr and scan with the phone:
// WhatsApp -> Settings -> Linked devices -> Link a device
router.get("/whatsapp/qr", localOnly, async (req, res) => {
  const w = whatsapp.status();
  let body;
  let refresh = true;

  if (!w.enabled) {
    body = "<h2>WhatsApp is switched off</h2><p>Add <code>WHATSAPP_ENABLED=true</code> to <code>server/.env</code>, then restart Jarvis.</p>";
    refresh = false;
  } else if (w.status === "ready") {
    body = "<h2>✅ WhatsApp is connected</h2><p>You can close this page. Try: “Hey Jarvis, any WhatsApp messages?”</p><p style='opacity:.6'>If Jarvis cannot read them, open <a style='color:#7fb4e8' href='/api/integrations/whatsapp/diagnose'>the self test</a>.</p>";
    refresh = false;
  } else if (w.status === "error") {
    body = `<h2>⚠️ WhatsApp problem</h2><p>${String(w.error || "unknown error").replace(/[<>&]/g, "")}</p>`;
    refresh = false;
  } else if (w.qr) {
    const dataUrl = await QRCode.toDataURL(w.qr, { margin: 2, width: 320 });
    body = `<h2>Link WhatsApp to Jarvis</h2>
      <p>On your phone: WhatsApp → Settings → Linked devices → Link a device, then scan:</p>
      <img src="${dataUrl}" width="320" height="320" style="background:#fff;border-radius:12px">
      <p style="opacity:.6">The code refreshes by itself.</p>`;
  } else {
    body = "<h2>Starting WhatsApp…</h2><p>This takes about 15 seconds the first time.</p>";
  }

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    ${refresh ? '<meta http-equiv="refresh" content="4">' : ""}
    <title>Jarvis · WhatsApp</title></head>
    <body style="background:#05080d;color:#dbe7ff;font-family:Segoe UI,sans-serif;text-align:center;padding-top:60px">${body}</body></html>`);
});

module.exports = router;
