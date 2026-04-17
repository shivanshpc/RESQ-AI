// ============================================================
// RESQ-AI  |  Feature 4: AI Damage Assessment Engine
// File: backend/routes/damage-ai.js
//
// HOW TO ACTIVATE:
//   1. npm install multer node-fetch dotenv   (inside /backend folder)
//   2. Set ANTHROPIC_API_KEY in backend/.env
//   3. In server.js add:
//        const damageAI = require('./routes/damage-ai');
//        app.use('/api/damage', damageAI);
// ============================================================

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');

// Store uploads temporarily in memory (no disk writes needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const DATA_FILE = path.join(__dirname, '../data/db.json');
function readDb()    { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function uid(p)      { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

// ────────────────────────────────────────────────────────────
//  POST /api/damage/assess
//  Multipart form: image (file), location (string), region (string)
//
//  Accepts: JPEG, PNG, WebP satellite/aerial/ground imagery
//  Returns: { damage_level, structures_analyzed, damage_breakdown,
//             priority_zones[], recommended_relief, reasoning }
// ────────────────────────────────────────────────────────────
router.post('/assess', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded. Send as multipart form with field name "image"' });
  }

  const apiKey  = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)  return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });

  const location = req.body.location || 'Unknown location';
  const region   = req.body.region   || 'Assam, India';

  // Convert uploaded image to base64 for Claude Vision
  const base64Image  = req.file.buffer.toString('base64');
  const mediaType    = req.file.mimetype || 'image/jpeg'; // e.g. "image/jpeg"

  const systemPrompt = `You are a disaster damage assessment AI trained on satellite and aerial imagery.
You analyze post-disaster images to classify structural damage and prioritize relief efforts.
Respond ONLY with valid JSON. No explanation text, no markdown, no code blocks.`;

  const userPrompt = `Analyze this disaster image from ${location}, ${region}.

Classify each visible structure/area using the xBD damage scale:
- No Damage: Structure intact, no visible damage
- Minor Damage: Partial roof/wall damage, remains habitable  
- Major Damage: Significant structural compromise, uninhabitable
- Destroyed: Complete collapse or obliteration

Return ONLY this JSON structure:
{
  "damage_level_overall": "CATASTROPHIC" | "SEVERE" | "MODERATE" | "MINOR",
  "image_type": "satellite" | "aerial" | "ground-level" | "unknown",
  "structures_visible": number,
  "damage_breakdown": {
    "no_damage": number,
    "minor_damage": number,
    "major_damage": number,
    "destroyed": number
  },
  "flood_water_visible": boolean,
  "road_blockages_detected": number,
  "priority_zones": [
    {
      "zone": "Zone name or description",
      "priority": "P1" | "P2" | "P3",
      "reason": "brief reason",
      "estimated_affected": number
    }
  ],
  "immediate_needs": ["list", "of", "urgent", "relief", "items"],
  "access_routes_assessment": "brief assessment of visible access routes",
  "confidence_score": number between 0 and 100,
  "reasoning": "2 sentence explanation of the key damage indicators observed"
}`;

  try {
    const fetch  = (await import('node-fetch')).default;
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages: [{
          role:    'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image }
            },
            { type: 'text', text: userPrompt }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(502).json({ error: 'Claude Vision API error', detail: errText });
    }

    const apiData   = await apiRes.json();
    const rawText   = apiData.content?.[0]?.text || '{}';
    const cleanText = rawText.replace(/```json|```/g, '').trim();
    const assessment = JSON.parse(cleanText);

    // ── Persist the assessment in DB ──────────────────────
    const db = readDb();
    const assessmentRecord = {
      id:         uid('dmg'),
      location,
      region,
      assessment,
      imageSize:  req.file.size,
      mimeType:   mediaType,
      createdAt:  new Date().toISOString()
    };

    if (!db.damage_assessments) db.damage_assessments = [];
    db.damage_assessments.unshift(assessmentRecord);
    db.damage_assessments = db.damage_assessments.slice(0, 50); // Keep last 50

    db.logs.unshift({
      id:        uid('log'),
      level:     assessment.damage_level_overall === 'CATASTROPHIC' ? 'ALERT' : 'INFO',
      message:   `Damage Assessment: ${assessment.damage_level_overall} at ${location} — ${assessment.structures_visible} structures analyzed`,
      createdAt: new Date().toISOString()
    });
    db.logs = db.logs.slice(0, 300);
    writeDb(db);

    return res.status(201).json({
      id:        assessmentRecord.id,
      location,
      timestamp: assessmentRecord.createdAt,
      ...assessment
    });

  } catch (err) {
    return res.status(500).json({ error: 'Assessment failed', detail: err.message });
  }
});

// ── GET /api/damage/history — last 20 assessments ────────────
router.get('/history', (_req, res) => {
  const db = readDb();
  res.json((db.damage_assessments || []).slice(0, 20));
});

module.exports = router;
