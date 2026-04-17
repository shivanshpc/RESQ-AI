// ============================================================
// RESQ-AI  |  server.js  —  UPDATED VERSION
// 
// This is your complete server.js with all 5 AI features added.
// REPLACE your existing backend/server.js with this file entirely.
//
// Before running: npm install twilio multer node-fetch dotenv
// ============================================================

const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '10mb' }));            // ← increased for image payloads

const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const seed = {
      settings:          { theme: 'light', activeDisaster: 'Assam Flood', region: 'Assam, India' },
      checklist:         { doc: false, torch: false, firstaid: false, hydration: false },
      resources: [
        { id: uid('res'), name: 'Drinking Water', category: 'Food',    stock: 4800, unit: 'liters', location: 'Guwahati Central Depot', createdAt: new Date().toISOString() },
        { id: uid('res'), name: 'ORS Packets',    category: 'Medical', stock: 920,  unit: 'packs',  location: 'Jorhat Relief Camp',       createdAt: new Date().toISOString() }
      ],
      volunteers: [
        { id: uid('vol'), name: 'Riya Das', phone: '9000000011', skill: 'First Aid', shift: 'Morning', location: 'Ward 4 Base', status: 'active', createdAt: new Date().toISOString() }
      ],
      shelters: [
        { id: uid('sh'), name: "Guwahati-5 — St. Xavier's School", area: 'Guwahati', capacity: 500, occupied: 347, hasFood: true, hasWater: true, hasMedical: true,  status: 'active', createdAt: new Date().toISOString() },
        { id: uid('sh'), name: 'Guwahati-3 — District Hall',       area: 'Guwahati', capacity: 500, occupied: 420, hasFood: true, hasWater: true, hasMedical: false, status: 'active', createdAt: new Date().toISOString() }
      ],
      reports:            [],
      alerts:             [],
      damage_assessments: [],                        // ← NEW for Feature 4
      logs: [
        { id: uid('log'), level: 'INFO', message: 'Backend initialized successfully.', createdAt: new Date().toISOString() }
      ],
      counters: { alertsDispatched: 32418 }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function readDb()    { ensureDataFile(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8'); }

function createLog(db, level, message) {
  db.logs.unshift({ id: uid('log'), level, message, createdAt: new Date().toISOString() });
  db.logs = db.logs.slice(0, 300);
}

function deriveStats(db) {
  const activeReports = db.reports.filter(r => r.status !== 'resolved');
  const sosCount      = activeReports.filter(r => (r.type || '').toLowerCase().includes('sos')).length;
  return {
    peopleAtRisk:        Math.max(12000, activeReports.length * 180 + 45200),
    alertsSent:          db.counters.alertsDispatched,
    sosUnresolved:       sosCount,
    reportsActive:       activeReports.length,
    sheltersActive:      db.shelters.filter(s => s.status === 'active').length,
    shelterCapacityFree: db.shelters.reduce((s, sh) => s + Math.max(0, (sh.capacity||0) - (sh.occupied||0)), 0),
    resourcesCount:      db.resources.length,
    volunteersActive:    db.volunteers.filter(v => v.status !== 'inactive').length
  };
}

function parseIntSafe(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }

// ════════════════════════════════════════════════════════════
//  EXISTING ROUTES (unchanged)
// ════════════════════════════════════════════════════════════

app.get('/api/health',    (_req, res) => res.json({ ok: true, service: 'resq-ai-backend', timestamp: new Date().toISOString() }));
app.get('/api/bootstrap', (_req, res) => {
  const db = readDb();
  res.json({ settings: db.settings, checklist: db.checklist, stats: deriveStats(db), resources: db.resources, volunteers: db.volunteers, shelters: db.shelters, reports: db.reports, alerts: db.alerts, logs: db.logs.slice(0, 100) });
});
app.get('/api/stats',  (_req, res) => { const db = readDb(); res.json(deriveStats(db)); });
app.get('/api/settings',  (_req, res) => { const db = readDb(); res.json(db.settings); });
app.put('/api/settings',  (req, res)  => { const db = readDb(); db.settings = { ...db.settings, ...(req.body||{}) }; createLog(db,'INFO','Settings updated.'); writeDb(db); res.json(db.settings); });
app.get('/api/checklist', (_req, res) => { const db = readDb(); res.json(db.checklist); });
app.put('/api/checklist', (req, res)  => { const db = readDb(); db.checklist = { ...db.checklist, ...(req.body||{}) }; createLog(db,'INFO','Checklist updated.'); writeDb(db); res.json(db.checklist); });

app.get('/api/resources',     (_req, res) => { const db = readDb(); res.json(db.resources); });
app.post('/api/resources',    (req, res)  => { const { name, category, stock, unit, location } = req.body||{}; if (!name||!category||!location) return res.status(400).json({ error:'name, category, and location are required' }); const db=readDb(); const resource={id:uid('res'),name,category,stock:parseIntSafe(stock,0),unit:unit||'units',location,createdAt:new Date().toISOString()}; db.resources.unshift(resource); createLog(db,'INFO',`Resource added: ${name}`); writeDb(db); return res.status(201).json(resource); });
app.patch('/api/resources/:id', (req, res) => { const db=readDb(); const idx=db.resources.findIndex(r=>r.id===req.params.id); if(idx<0) return res.status(404).json({error:'not found'}); db.resources[idx]={...db.resources[idx],...(req.body||{})}; createLog(db,'INFO',`Resource updated: ${db.resources[idx].name}`); writeDb(db); return res.json(db.resources[idx]); });
app.delete('/api/resources/:id', (req, res) => { const db=readDb(); const r=db.resources.find(x=>x.id===req.params.id); if(!r) return res.status(404).json({error:'not found'}); db.resources=db.resources.filter(x=>x.id!==req.params.id); createLog(db,'WARN',`Resource removed: ${r.name}`); writeDb(db); return res.status(204).send(); });

app.get('/api/volunteers',     (_req, res) => { const db = readDb(); res.json(db.volunteers); });
app.post('/api/volunteers',    (req, res)  => { const { name, phone, skill, shift, location } = req.body||{}; if (!name||!phone||!location) return res.status(400).json({error:'name, phone, location required'}); const db=readDb(); const v={id:uid('vol'),name,phone,skill:skill||'General',shift:shift||'Any Shift',location,status:'active',createdAt:new Date().toISOString()}; db.volunteers.unshift(v); createLog(db,'INFO',`Volunteer registered: ${name}`); writeDb(db); return res.status(201).json(v); });
app.patch('/api/volunteers/:id', (req, res) => { const db=readDb(); const idx=db.volunteers.findIndex(v=>v.id===req.params.id); if(idx<0) return res.status(404).json({error:'not found'}); db.volunteers[idx]={...db.volunteers[idx],...(req.body||{})}; createLog(db,'INFO',`Volunteer updated: ${db.volunteers[idx].name}`); writeDb(db); return res.json(db.volunteers[idx]); });
app.delete('/api/volunteers/:id', (req, res) => { const db=readDb(); const v=db.volunteers.find(x=>x.id===req.params.id); if(!v) return res.status(404).json({error:'not found'}); db.volunteers=db.volunteers.filter(x=>x.id!==req.params.id); createLog(db,'WARN',`Volunteer removed: ${v.name}`); writeDb(db); return res.status(204).send(); });

app.get('/api/shelters',    (_req, res) => { const db = readDb(); res.json(db.shelters); });
app.post('/api/shelters',   (req, res)  => { const { name, area, capacity, occupied, hasFood, hasWater, hasMedical, status } = req.body||{}; if (!name||!area) return res.status(400).json({error:'name and area required'}); const db=readDb(); const s={id:uid('sh'),name,area,capacity:parseIntSafe(capacity,0),occupied:parseIntSafe(occupied,0),hasFood:!!hasFood,hasWater:!!hasWater,hasMedical:!!hasMedical,status:status||'active',createdAt:new Date().toISOString()}; db.shelters.unshift(s); createLog(db,'INFO',`Shelter added: ${name}`); writeDb(db); return res.status(201).json(s); });
app.patch('/api/shelters/:id', (req, res) => { const db=readDb(); const idx=db.shelters.findIndex(s=>s.id===req.params.id); if(idx<0) return res.status(404).json({error:'not found'}); db.shelters[idx]={...db.shelters[idx],...req.body,capacity:req.body.capacity!==undefined?parseIntSafe(req.body.capacity,db.shelters[idx].capacity):db.shelters[idx].capacity,occupied:req.body.occupied!==undefined?parseIntSafe(req.body.occupied,db.shelters[idx].occupied):db.shelters[idx].occupied}; createLog(db,'INFO',`Shelter updated: ${db.shelters[idx].name}`); writeDb(db); return res.json(db.shelters[idx]); });
app.delete('/api/shelters/:id', (req, res) => { const db=readDb(); const s=db.shelters.find(x=>x.id===req.params.id); if(!s) return res.status(404).json({error:'not found'}); db.shelters=db.shelters.filter(x=>x.id!==req.params.id); createLog(db,'WARN',`Shelter removed: ${s.name}`); writeDb(db); return res.status(204).send(); });

app.get('/api/reports',  (req, res) => { const { status, severity, type } = req.query; const db=readDb(); let out=[...db.reports]; if(status)   out=out.filter(r=>(r.status||'').toLowerCase()===String(status).toLowerCase()); if(severity) out=out.filter(r=>(r.severity||'').toLowerCase().includes(String(severity).toLowerCase())); if(type)     out=out.filter(r=>(r.type||'').toLowerCase().includes(String(type).toLowerCase())); return res.json(out); });
app.get('/api/reports/:id', (req, res) => { const db=readDb(); const r=db.reports.find(r=>r.id===req.params.id); if(!r) return res.status(404).json({error:'not found'}); return res.json(r); });
app.post('/api/reports', (req, res) => { const { reportName, type, location, severity, description, source, latitude, longitude } = req.body||{}; if (!type||!location||!description) return res.status(400).json({error:'type, location, description required'}); const db=readDb(); const lat=Number(latitude); const lng=Number(longitude); const report={id:uid('rep'),reportName:reportName||`${type} — ${location}`,type,location,locationDescription:location,severity:severity||'Medium',description,latitude:Number.isFinite(lat)?lat:null,longitude:Number.isFinite(lng)?lng:null,source:source||'APP',status:'pending',confirmations:0,createdAt:new Date().toISOString()}; db.reports.unshift(report); createLog(db,'COMM',`New report at ${location}`); writeDb(db); return res.status(201).json(report); });
app.patch('/api/reports/:id', (req, res) => { const db=readDb(); const idx=db.reports.findIndex(r=>r.id===req.params.id); if(idx<0) return res.status(404).json({error:'not found'}); db.reports[idx]={...db.reports[idx],...(req.body||{})}; createLog(db,'INFO',`Report updated: ${req.params.id}`); writeDb(db); return res.json(db.reports[idx]); });
app.delete('/api/reports/:id', (req, res) => { const db=readDb(); const r=db.reports.find(x=>x.id===req.params.id); if(!r) return res.status(404).json({error:'not found'}); db.reports=db.reports.filter(x=>x.id!==req.params.id); createLog(db,'WARN',`Report deleted: ${req.params.id}`); writeDb(db); return res.status(204).send(); });

app.get('/api/alerts',  (_req, res) => { const db = readDb(); res.json(db.alerts); });
app.post('/api/alerts/dispatch', (req, res) => { const { title, message, severity, channels, targetPopulation } = req.body||{}; if (!title||!message) return res.status(400).json({error:'title and message required'}); const db=readDb(); const dispatched=parseIntSafe(targetPopulation,1000); const alert={id:uid('alr'),title,message,severity:severity||'WARNING',channels:Array.isArray(channels)&&channels.length?channels:['APP PUSH','SMS'],targetPopulation:dispatched,createdAt:new Date().toISOString()}; db.alerts.unshift(alert); db.counters.alertsDispatched+=dispatched; createLog(db,'ALERT',`Alert dispatched: ${title} to ${dispatched}`); writeDb(db); return res.status(201).json(alert); });
app.delete('/api/alerts/:id', (req, res) => { const db=readDb(); const a=db.alerts.find(x=>x.id===req.params.id); if(!a) return res.status(404).json({error:'not found'}); db.alerts=db.alerts.filter(x=>x.id!==req.params.id); createLog(db,'WARN',`Alert deleted: ${req.params.id}`); writeDb(db); return res.status(204).send(); });

app.get('/api/logs',  (req, res) => { const db=readDb(); const limit=Math.max(1,Math.min(500,parseIntSafe(req.query.limit,100))); res.json(db.logs.slice(0,limit)); });
app.post('/api/logs', (req, res) => { const { level, message } = req.body||{}; if (!message) return res.status(400).json({error:'message required'}); const db=readDb(); createLog(db,(level||'INFO').toUpperCase(),message); writeDb(db); return res.status(201).json(db.logs[0]); });

app.post('/api/reset', (_req, res) => { if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE); ensureDataFile(); const db=readDb(); createLog(db,'WARN','Database reset.'); writeDb(db); res.json({ ok:true }); });

// ════════════════════════════════════════════════════════════
//  NEW AI FEATURE ROUTES  ← Added for the 5 integrations
// ════════════════════════════════════════════════════════════

// Feature 1: AI Early Warning predictions (Claude API)
const aiPredict   = require('./routes/ai-predict');
app.use('/api/predict', aiPredict);

// Feature 3: Smart Evacuation Routing (OpenRouteService)
const routing     = require('./routes/routing');
app.use('/api/routing', routing);

// Feature 4: AI Damage Assessment (Claude Vision)
const damageAI    = require('./routes/damage-ai');
app.use('/api/damage', damageAI);

// Feature 5: Multichannel Alerts (Twilio SMS + WhatsApp)
const twilioAlerts = require('./routes/alerts-twilio');
app.use('/api/alerts', twilioAlerts);

// ════════════════════════════════════════════════════════════
//  STATIC FILES & SERVER START
// ════════════════════════════════════════════════════════════

const frontendRoot = path.join(__dirname, '..', 'frontend');
app.use('/css', express.static(path.join(frontendRoot, 'css')));
app.use('/js',  express.static(path.join(frontendRoot, 'js')));
app.use(express.static(frontendRoot));
app.get('/', (_req, res) => res.sendFile(path.join(frontendRoot, 'index.html')));
app.use((err, _req, res, _next) => res.status(500).json({ error: 'internal_server_error', detail: err.message }));
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

ensureDataFile();
app.listen(PORT, HOST, () => {
  console.log(`RESQ-AI backend running at http://${HOST}:${PORT}`);
  console.log(`AI Features: Claude=${!!process.env.ANTHROPIC_API_KEY} | Twilio=${!!process.env.TWILIO_ACCOUNT_SID} | ORS=${!!process.env.ORS_API_KEY}`);
});
