// ============================================================
// RESQ-AI  |  Feature 1: AI Early Warning System
// File: backend/routes/ai-predict.js
//
// HOW TO ACTIVATE:
//   1. npm install node-fetch dotenv   (inside /backend folder)
//   2. Set ANTHROPIC_API_KEY in backend/.env
//   3. In server.js add these 2 lines near the top (after require('dotenv').config()):
//        const aiPredict = require('./routes/ai-predict');
//        app.use('/api/predict', aiPredict);
// ============================================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requestBridge, ensureBridgeRunning, isBridgeReachable } = require('../lib/fastapi-bridge');

const DATA_FILE = path.join(__dirname, '../data/db.json');
function readDb() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function uid(p) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ────────────────────────────────────────────────────────────
//  POST /api/predict/flood
//  Body: { rainfall_mm_hr, soil_saturation_pct, river_level_pct, wind_speed_kmh }
//  Returns: { severity, tier, confidence, time_to_impact_hrs, area_km2,
//             affected_population, recommended_actions[], model_reasoning }
// ────────────────────────────────────────────────────────────
router.post('/flood', async (req, res) => {
  const {
    rainfall_mm_hr = 0,
    soil_saturation_pct = 0,
    river_level_pct = 0,
    wind_speed_kmh = 0,
    region = 'Assam, India'
  } = req.body || {};

  try {
    const bridgeBody = { rainfall_mm_hr, soil_saturation_pct, river_level_pct, wind_speed_kmh, region };
    const bridgeResult = await requestBridge(
      '/predict/flood',
      () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bridgeBody)
      }),
      { attempts: 3 }
    );

    if (!bridgeResult.ok) {
      return res.status(502).json({
        error: 'FastAPI bridge error',
        detail: bridgeResult.error || 'No bridge response'
      });
    }

    const prediction = await bridgeResult.response.json();

    // ── Log the prediction in the DB ──
    const db = readDb();
    db.logs.unshift({
      id: uid('log'),
      level: prediction.severity === 'EMERGENCY' ? 'ALERT' : 'INFO',
      message: `AI Flood Prediction: ${prediction.severity} — ${prediction.confidence}% confidence — ${prediction.affected_population?.toLocaleString()} at risk`,
      createdAt: new Date().toISOString()
    });
    db.logs = db.logs.slice(0, 300);
    writeDb(db);

    return res.json({ ...prediction, inputs: req.body, timestamp: new Date().toISOString() });

  } catch (err) {
    return res.status(500).json({ error: 'Prediction failed', detail: err.message });
  }
});

// ────────────────────────────────────────────────────────────
//  POST /api/predict/wildfire
//  Body: { ndvi, humidity_pct, temperature_c, wind_speed_kmh }
// ────────────────────────────────────────────────────────────
router.post('/wildfire', async (req, res) => {
  const {
    ndvi = 0.3,
    humidity_pct = 60,
    temperature_c = 30,
    wind_speed_kmh = 20
  } = req.body || {};

  try {
    const bridgeBody = { ndvi, humidity_pct, temperature_c, wind_speed_kmh };
    const bridgeResult = await requestBridge(
      '/predict/wildfire',
      () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bridgeBody)
      }),
      { attempts: 3 }
    );

    if (!bridgeResult.ok) {
      return res.status(502).json({
        error: 'FastAPI bridge error',
        detail: bridgeResult.error || 'No bridge response'
      });
    }

    const data = await bridgeResult.response.json();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/predict/status — check if AI key is configured ──
router.get('/status', (_req, res) => {
  // Local mode: consider AI "configured" when the FastAPI bridge is reachable.
  // This avoids confusing UI messages about Anthropic keys.
  (async () => {
    try {
      await ensureBridgeRunning();
      const bridgeOk = await isBridgeReachable();
      return res.json({ configured: bridgeOk, bridge_ok: bridgeOk });
    } catch {
      return res.json({ configured: false, bridge_ok: false });
    }
  })();
});

module.exports = router;
