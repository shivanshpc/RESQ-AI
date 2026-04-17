const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const { requestBridge } = require('../lib/fastapi-bridge');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }
});

const DATA_FILE = path.join(__dirname, '../data/db.json');
function readDb()    { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function uid(p)      { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

router.post('/assess', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded. Send as multipart form with field name "image"' });
  }

  const location = req.body.location || 'Unknown location';
  const region   = req.body.region   || '';

  try {
    const { FormData, Blob } = await import('formdata-node');
    
    // Construct multi-part form to pipe over to the FastAPI PyTorch server
    const formData = new FormData();
    formData.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'upload.jpg');
    
    console.log("Routing image to local PyTorch FastAPI bridge...");
    const bridgeResult = await requestBridge(
      '/fast-predict',
      () => ({ method: 'POST', body: formData }),
      { attempts: 3 }
    );
    
     if (!bridgeResult.ok) {
       console.error("FastAPI error");
       return res.status(502).json({
         error: 'PyTorch local bridge unreachable. Auto-restart attempted but bridge is still unavailable.',
         detail: bridgeResult.error || 'No bridge response'
       });
    }
    
    const fData = await bridgeResult.response.json();
    if (!fData.success) {
      return res.status(500).json({ error: fData.error });
    }
    
    const preds = fData.predictions;

    // Mapping multi-label PyTorch predictions to RESQ-AI UI format
    let overall_level = "MINOR";
    if (preds['buildings_minor_or_greater'] > 50 || preds['flooding_structures'] > 50) overall_level = "MODERATE";
    if (preds['buildings_affected_or_greater'] > 75 || preds['debris_any'] > 75) overall_level = "SEVERE";
    if (preds['buildings_affected_or_greater'] > 90 && preds['flooding_structures'] > 80) overall_level = "CATASTROPHIC";
    
    let confidence_avg = Object.values(preds).reduce((a,b) => a+b, 0) / 6;

    let priority_z = [];
    if (preds['flooding_structures'] > 60) {
       priority_z.push({ zone: `${location} Waterbodies`, priority: "P1", reason: "Severe flooding detected near structural zones", estimated_affected: 1500 });
    }
    if (preds['roads_damage'] > 50) {
       priority_z.push({ zone: `${location} Transit Corridors`, priority: "P2", reason: "Road blockages potentially isolating survivors", estimated_affected: 400 });
    }
    if (preds['buildings_minor_or_greater'] > 80) {
       priority_z.push({ zone: `${location} Residential Blocks`, priority: "P3", reason: "Significant structural damage detected", estimated_affected: 800 });
    }

    const assessment = {
      damage_level_overall: overall_level,
      image_type: "satellite",
      structures_visible: Math.floor(Math.random() * 50) + 10,
      damage_breakdown: {
        no_damage: Math.floor(preds['buildings_affected_or_greater'] < 50 ? 50 : 5),
        minor_damage: Math.floor(preds['buildings_minor_or_greater']),
        major_damage: Math.floor(preds['buildings_affected_or_greater'] > 75 ? 40 : 0),
        destroyed: Math.floor(preds['debris_any'] > 80 ? 20 : 0)
      },
      flood_water_visible: preds['flooding_structures'] > 50,
      road_blockages_detected: preds['roads_damage'] > 50 ? 3 : 0,
      priority_zones: priority_z,
      immediate_needs: preds['flooding_structures'] > 50 ? ["Rescue Boats", "Life Jackets"] : ["Medical Kits", "Food Rations", "Tents"],
      access_routes_assessment: preds['roads_damage'] > 50 ? "Impassable roads detected. Dispatch heavy clearance." : "Routes appear navigable.",
      confidence_score: Math.round(confidence_avg),
      reasoning: `PyTorch Deep Learning array detected: Buildings Minor (${preds['buildings_minor_or_greater']}%), Flooding (${preds['flooding_structures']}%), Road blockages (${preds['roads_damage']}%), Debris coverage (${preds['debris_any']}%).`
    };

    // ── Persist the assessment in DB ──────────────────────
    const db = readDb();
    const assessmentRecord = {
      id:         uid('dmg'),
      location,
      region,
      assessment,
      imageSize:  req.file.size,
      mimeType:   req.file.mimetype,
      createdAt:  new Date().toISOString()
    };

    if (!db.damage_assessments) db.damage_assessments = [];
    db.damage_assessments.unshift(assessmentRecord);
    db.damage_assessments = db.damage_assessments.slice(0, 50);

    db.logs.unshift({
      id:        uid('log'),
      level:     assessment.damage_level_overall === 'CATASTROPHIC' ? 'ALERT' : 'INFO',
      message:   `PyTorch AI Assessment: ${assessment.damage_level_overall} at ${location}`,
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
    console.error(err);
    return res.status(500).json({ error: 'PyTorch Bridge Assessment failed', detail: err.message });
  }
});

router.get('/history', (_req, res) => {
  const db = readDb();
  res.json((db.damage_assessments || []).slice(0, 20));
});

module.exports = router;
