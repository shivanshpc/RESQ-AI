// ============================================================
// RESQ-AI  |  Feature 5: Multichannel Alert & Communication
// File: backend/routes/alerts-twilio.js
//
// HOW TO ACTIVATE:
//   1. npm install twilio node-fetch   (inside /backend folder)
//   2. Create backend/.env  (see .env.example)
//   3. In server.js add these 3 lines near the top:
//        require('dotenv').config();
//        const twilioAlerts = require('./routes/alerts-twilio');
//        app.use('/api/alerts', twilioAlerts);
//   NOTE: The existing POST /api/alerts/dispatch still works for logging.
//         This route adds /api/alerts/send which actually sends via Twilio.
// ============================================================

const express  = require('express');
const router   = express.Router();
const twilio   = require('twilio');
const fs       = require('fs');
const path     = require('path');

const DATA_FILE = path.join(__dirname, '../data/db.json');

function readDb()  { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function uid(p)    { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

// ── Twilio client (lazy so missing creds don't crash the whole server) ──
function getTwilio() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env');
  return twilio(sid, token);
}

// ── Language translations for multilingual alerts ──
// (Uses Google Translate REST — free tier, no auth for basic use)
async function translateText(text, targetLang) {
  if (targetLang === 'en') return text;
  try {
    const fetch = (await import('node-fetch')).default;
    const url   = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res   = await fetch(url);
    const json  = await res.json();
    return json[0].map(s => s[0]).join('');
  } catch {
    return text; // Fallback to English if translation fails
  }
}

// ── Recipient list helpers ──
// In production replace this with your actual DB of phone numbers per zone.
function getRecipientsFromDb(targetPopulation) {
  const db = readDb();
  // Collect volunteer phones as a proxy for registered users
  const phones = db.volunteers
    .filter(v => v.status === 'active' && v.phone)
    .map(v => {
      let p = v.phone.toString().replace(/\D/g, '');
      if (!p.startsWith('+')) p = '+91' + p; // Default to India country code
      return p;
    });
  return phones;
}

// ────────────────────────────────────────────────────────────
//  POST /api/alerts/send
//  Body: { title, message, severity, channels[], language, targetPopulation, testPhone }
//
//  channels options: "SMS", "WHATSAPP", "APP PUSH"
//  language options: "en" (English), "hi" (Hindi), "as" (Assamese), "bn" (Bengali)
//  testPhone: if provided, only sends to this number (useful during dev)
// ────────────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const {
    title,
    message,
    severity      = 'WARNING',
    channels      = ['SMS'],
    language      = 'en',
    targetPopulation = 1000,
    testPhone     = null   // e.g. "+919876543210"  — overrides recipient list in dev
  } = req.body || {};

  if (!title || !message) {
    return res.status(400).json({ error: 'title and message are required' });
  }

  const results = { sms: [], whatsapp: [], errors: [] };

  try {
    const client = getTwilio();
    const translatedMessage = await translateText(message, language);

    // Build the formatted SMS body
    const smsText = `[RESQ-AI ${severity}] ${title}\n${translatedMessage}\n\nReply STOP to unsubscribe`;

    // Decide who gets the message
    const recipients = testPhone
      ? [testPhone]
      : getRecipientsFromDb(targetPopulation);

    if (recipients.length === 0) {
      return res.status(200).json({
        sent: 0,
        message: 'No registered recipients found. Add volunteers with phone numbers first.',
        results
      });
    }

    // ── Send SMS ──────────────────────────────────────────
    if (channels.includes('SMS')) {
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;
      if (!fromNumber) {
        results.errors.push('TWILIO_PHONE_NUMBER not set — SMS skipped');
      } else {
        for (const to of recipients) {
          try {
            const msg = await client.messages.create({ body: smsText, from: fromNumber, to });
            results.sms.push({ to, sid: msg.sid, status: msg.status });
          } catch (err) {
            results.errors.push(`SMS to ${to} failed: ${err.message}`);
          }
        }
      }
    }

    // ── Send WhatsApp ─────────────────────────────────────
    if (channels.includes('WHATSAPP')) {
      // Use Twilio sandbox number or your approved WhatsApp sender
      const waFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
      for (const to of recipients) {
        try {
          const msg = await client.messages.create({
            body: `*${severity} — ${title}*\n\n${translatedMessage}`,
            from: waFrom,
            to:   `whatsapp:${to}`
          });
          results.whatsapp.push({ to, sid: msg.sid, status: msg.status });
        } catch (err) {
          results.errors.push(`WhatsApp to ${to} failed: ${err.message}`);
        }
      }
    }

    // ── Log the dispatch in the DB ────────────────────────
    const db = readDb();
    const totalSent = results.sms.length + results.whatsapp.length;
    db.alerts.unshift({
      id:               uid('alr'),
      title,
      message:          translatedMessage,
      severity,
      channels,
      language,
      targetPopulation: parseInt(targetPopulation, 10),
      actualSent:       totalSent,
      createdAt:        new Date().toISOString()
    });
    db.counters.alertsDispatched += parseInt(targetPopulation, 10);
    db.logs.unshift({
      id:        uid('log'),
      level:     'ALERT',
      message:   `Twilio dispatch: "${title}" → ${totalSent} messages sent (${results.errors.length} errors)`,
      createdAt: new Date().toISOString()
    });
    db.logs = db.logs.slice(0, 300);
    writeDb(db);

    return res.status(201).json({
      sent:   totalSent,
      errors: results.errors,
      results
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/send/status  — check Twilio credentials ──
router.get('/send/status', (_req, res) => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;
  res.json({
    twilioConfigured: !!(sid && token && phone),
    smsReady:         !!(sid && token && phone),
    whatsappSandbox:  !!(sid && token),
    missing:          [
      !sid   && 'TWILIO_ACCOUNT_SID',
      !token && 'TWILIO_AUTH_TOKEN',
      !phone && 'TWILIO_PHONE_NUMBER'
    ].filter(Boolean)
  });
});

module.exports = router;
