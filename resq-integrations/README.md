# RESQ-AI — 5 Feature Integration Guide

## Files in This Package

```
resq-integrations/
├── backend/
│   ├── server.js                 ← REPLACE your existing server.js
│   ├── .env.example              ← COPY to .env and fill in your keys
│   └── routes/
│       ├── alerts-twilio.js      ← Feature 5: SMS + WhatsApp
│       ├── ai-predict.js         ← Feature 1: AI Early Warning
│       ├── routing.js            ← Feature 3: Evacuation Routing
│       └── damage-ai.js          ← Feature 4: Damage Assessment
└── frontend/
    ├── early-warning.html        ← REPLACE your existing file
    ├── alert-system.html         ← REPLACE your existing file
    ├── evacuation.html           ← REPLACE your existing file
    └── damage-assessment.html    ← REPLACE your existing file
```

---

## Step 1 — Install New Dependencies

Open a terminal, go to your `backend/` folder and run:

```bash
cd backend
npm install twilio multer node-fetch dotenv
```

---

## Step 2 — Set Up API Keys

Copy the `.env.example` file:
```bash
cp .env.example .env
```

Then open `backend/.env` and fill in your keys:

### Feature 5 — Twilio (SMS + WhatsApp)
1. Sign up at https://console.twilio.com (free trial)
2. Get your Account SID and Auth Token from the dashboard
3. Buy a phone number (~$1/month) or use the free sandbox
4. For WhatsApp: join the Twilio Sandbox (no cost in dev)

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

### Feature 1 — Claude AI Prediction
1. Go to https://console.anthropic.com → API Keys
2. Create a new key

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Feature 3 — OpenRouteService (Evacuation Routing)
1. Go to https://openrouteservice.org/dev/#/signup (free)
2. Create an account and copy your API key

```
ORS_API_KEY=your_ors_api_key_here
```

### Feature 4 — AI Damage Assessment
Uses the same ANTHROPIC_API_KEY as Feature 1 — no extra setup needed.

### Feature 2 — Community Map
Uses Leaflet.js (open source, no API key needed).
The map is already updated in your existing community-map.html.

---

## Step 3 — Copy the New Files

### Backend
```bash
# From inside your project root:
cp resq-integrations/backend/server.js              backend/server.js
cp resq-integrations/backend/routes/alerts-twilio.js backend/routes/alerts-twilio.js
cp resq-integrations/backend/routes/ai-predict.js    backend/routes/ai-predict.js
cp resq-integrations/backend/routes/routing.js        backend/routes/routing.js
cp resq-integrations/backend/routes/damage-ai.js      backend/routes/damage-ai.js

# Create the routes folder if it doesn't exist:
mkdir -p backend/routes
```

### Frontend
```bash
cp resq-integrations/frontend/early-warning.html    frontend/early-warning.html
cp resq-integrations/frontend/alert-system.html     frontend/alert-system.html
cp resq-integrations/frontend/evacuation.html       frontend/evacuation.html
cp resq-integrations/frontend/damage-assessment.html frontend/damage-assessment.html
```

---

## Step 4 — Start the Server

```bash
cd backend
npm start
```

You'll see:
```
RESQ-AI backend running at http://0.0.0.0:4000
AI Features: Claude=true | Twilio=true | ORS=true
```

---

## Testing Each Feature

### Feature 5 — Alert System
1. Open http://localhost:4000/alert-system.html
2. You'll see a green "Twilio connected" dot if keys are set
3. Enter a test phone number in the "Test Phone" field
4. Select SMS and/or WhatsApp channels
5. Click "Dispatch Alert" — you'll receive a real SMS

### Feature 1 — Early Warning
1. Open http://localhost:4000/early-warning.html
2. Green dot = Claude API connected
3. Adjust the sliders
4. Click "Run AI Prediction"
5. Results appear in 3–5 seconds with multilingual alerts

### Feature 3 — Evacuation Routing
1. Open http://localhost:4000/evacuation.html
2. Click one of the quick location presets (Dibrugarh, Jorhat, Guwahati)
3. Click "Get Safe Route"
4. A real route appears on the Leaflet map avoiding flooded zones

### Feature 4 — Damage Assessment
1. Open http://localhost:4000/damage-assessment.html
2. Find any aerial or satellite image of a disaster area
3. Drag and drop it into the upload zone
4. Enter a location name, click "Analyze with AI"
5. Claude Vision classifies damage in 3–5 seconds

---

## How the Features Work Together

```
Community Reports  →  adds flood zones to DB
        ↓
Evacuation Routing →  fetches flood zones, avoids them in route
        ↓
Early Warning AI   →  generates alerts in 3 languages
        ↓
Alert System       →  sends those alerts via SMS + WhatsApp (Twilio)
        ↓
Damage Assessment  →  uploaded images analyzed → updates priority zones
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "ANTHROPIC_API_KEY not configured" | Check backend/.env has the key |
| "TWILIO_ACCOUNT_SID not set" | Add Twilio creds to .env, restart server |
| Routing returns error | Check ORS_API_KEY in .env, verify free quota |
| Image upload fails | Make sure `npm install multer` was run |
| Cannot connect to backend | Run `cd backend && npm start` first |
| "module not found: twilio" | Run `npm install twilio` in backend/ |

---

## Cost Estimates (Monthly at Scale)

| Service | Free Tier | Cost at 10k alerts |
|---|---|---|
| Anthropic Claude API | $5 credit | ~$0.50 per 1000 predictions |
| Twilio SMS (India) | $15 free credit | ~₹1.5 per SMS (~₹15,000) |
| Twilio WhatsApp | Free sandbox (dev) | ~₹0.80 per message |
| OpenRouteService | 2,000 req/day free | Free for most use cases |
| Leaflet Maps | Free (OSM) | Always free |
