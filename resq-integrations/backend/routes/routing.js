// ============================================================
// RESQ-AI  |  Feature 3: Smart Evacuation Routing Engine
// File: backend/routes/routing.js
//
// HOW TO ACTIVATE:
//   1. npm install node-fetch dotenv   (inside /backend folder)
//   2. Set ORS_API_KEY in backend/.env  (free at openrouteservice.org)
//   3. In server.js add:
//        const routing = require('./routes/routing');
//        app.use('/api/routing', routing);
// ============================================================

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const DATA_FILE = path.join(__dirname, '../data/db.json');
function readDb() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

// ── Shelters with real coordinates (Assam, India) ────────────
// Extend this list with your actual shelter locations
const SHELTER_COORDS = {
  'guwahati-5': { lat: 26.1445, lng: 91.7362, name: "Guwahati-5 — St. Xavier's School" },
  'guwahati-3': { lat: 26.1825, lng: 91.7458, name: 'Guwahati-3 — District Hall' },
  'jorhat-1':   { lat: 26.7509, lng: 94.2037, name: 'Jorhat Community Centre' },
  'dibrugarh-1':{ lat: 27.4728, lng: 94.9120, name: 'Dibrugarh Relief Camp' }
};

// ────────────────────────────────────────────────────────────
//  POST /api/routing/evacuate
//  Body: {
//    from_lat, from_lng,            — user's current location
//    shelter_id (optional),         — specific shelter or auto-picks nearest safe one
//    avoid_flooded (boolean)        — true = route avoids flooded zones from reports
//  }
//  Returns: { route, steps[], distance_km, duration_min, shelter, sms_route }
// ────────────────────────────────────────────────────────────
router.post('/evacuate', async (req, res) => {
  const {
    from_lat,
    from_lng,
    shelter_id   = null,
    avoid_flooded = true
  } = req.body || {};

  if (!from_lat || !from_lng) {
    return res.status(400).json({ error: 'from_lat and from_lng are required' });
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ORS_API_KEY not set in .env' });

  try {
    const fetch = (await import('node-fetch')).default;
    const db    = readDb();

    // ── Pick the destination shelter ──────────────────────
    let targetShelter;
    if (shelter_id && SHELTER_COORDS[shelter_id]) {
      targetShelter = SHELTER_COORDS[shelter_id];
    } else {
      // Auto-pick the shelter with most free capacity
      const shelterList = db.shelters.filter(s => s.status === 'active');
      const mostFree    = shelterList.sort((a, b) => (b.capacity - b.occupied) - (a.capacity - a.occupied))[0];

      // Find matching coordinate entry (or use default)
      const coordKey = Object.keys(SHELTER_COORDS).find(k =>
        SHELTER_COORDS[k].name.toLowerCase().includes((mostFree?.area || '').toLowerCase())
      ) || 'guwahati-5';
      targetShelter = SHELTER_COORDS[coordKey];
    }

    // ── Build avoid-polygons from flooded reports in DB ───
    const avoidOptions = {};
    if (avoid_flooded) {
      const floodReports = db.reports.filter(r =>
        r.status !== 'resolved' &&
        r.latitude && r.longitude &&
        (r.type || '').toLowerCase().includes('flood')
      );

      if (floodReports.length > 0) {
        // Create small 500m radius squares around each flood report point
        const avoidPolygons = floodReports.map(r => {
          const d = 0.005; // ~500m in degrees
          return [[
            [r.longitude - d, r.latitude - d],
            [r.longitude + d, r.latitude - d],
            [r.longitude + d, r.latitude + d],
            [r.longitude - d, r.latitude + d],
            [r.longitude - d, r.latitude - d]
          ]];
        });
        avoidOptions.avoid_polygons = { type: 'MultiPolygon', coordinates: avoidPolygons };
      }
    }

    // ── Call OpenRouteService Directions API ──────────────
    const orsBody = {
      coordinates: [
        [parseFloat(from_lng), parseFloat(from_lat)],
        [targetShelter.lng,    targetShelter.lat]
      ],
      instructions:     true,
      language:         'en',
      units:            'km',
      geometry:         true,
      ...(Object.keys(avoidOptions).length ? { options: avoidOptions } : {})
    };

    const orsRes = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/json', {
      method:  'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify(orsBody)
    });

    if (!orsRes.ok) {
      const err = await orsRes.text();
      return res.status(502).json({ error: 'OpenRouteService error', detail: err });
    }

    const orsData = await orsRes.json();
    const route   = orsData.routes?.[0];
    if (!route) return res.status(404).json({ error: 'No route found' });

    const summary  = route.summary;
    const segments = route.segments?.[0]?.steps || [];

    // ── Format steps for the UI ───────────────────────────
    const steps = segments.map((step, i) => ({
      step:        i + 1,
      instruction: step.instruction,
      distance_km: (step.distance / 1000).toFixed(2),
      duration_min: (step.duration / 60).toFixed(0),
      type:        step.type  // 0=left, 1=right, 11=depart, 10=arrive etc.
    }));

    // ── Build SMS-format route (for feature-phone users) ──
    const smsRoute = `RESQ ROUTE to ${targetShelter.name}:\n` +
      steps.slice(0, 5).map((s, i) => `${i+1}. ${s.instruction} (${s.distance_km}km)`).join('\n') +
      `\nTOTAL: ${(summary.distance/1000).toFixed(1)}km ~${Math.round(summary.duration/60)}min`;

    return res.json({
      shelter:      targetShelter,
      distance_km:  parseFloat((summary.distance / 1000).toFixed(2)),
      duration_min: Math.round(summary.duration / 60),
      steps,
      geometry:     route.geometry,  // GeoJSON for Leaflet map display
      sms_route:    smsRoute,
      flooded_zones_avoided: avoid_flooded
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
//  GET /api/routing/shelters
//  Returns available shelters with coords and capacity info
// ────────────────────────────────────────────────────────────
router.get('/shelters', (_req, res) => {
  const db = readDb();
  const enriched = db.shelters
    .filter(s => s.status === 'active')
    .map(s => {
      const coordKey = Object.keys(SHELTER_COORDS).find(k =>
        SHELTER_COORDS[k].name.toLowerCase().includes(s.name.split('—')[0].trim().toLowerCase())
      );
      return {
        ...s,
        lat:        coordKey ? SHELTER_COORDS[coordKey].lat : null,
        lng:        coordKey ? SHELTER_COORDS[coordKey].lng : null,
        free_slots: Math.max(0, s.capacity - s.occupied),
        pct_full:   Math.round((s.occupied / s.capacity) * 100)
      };
    });
  res.json(enriched);
});

module.exports = router;
