# RESQ-AI Backend

Complete backend API for the disaster management frontend.

## Features

- Persistent storage using JSON database file (`backend/data/db.json`)
- Full REST API for:
  - Reports
  - Alerts
  - Resources
  - Volunteers
  - Shelters
  - Logs
  - Checklist
  - Settings
  - Derived dashboard stats
- Serves the frontend HTML from project root

## Run

```bash
cd backend
npm install
npm start
```

App runs at: `http://localhost:4000`

## Core Endpoints

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/stats`

### Reports
- `GET /api/reports`
- `POST /api/reports`
- `PATCH /api/reports/:id`
- `DELETE /api/reports/:id`

### Resources
- `GET /api/resources`
- `POST /api/resources`
- `PATCH /api/resources/:id`
- `DELETE /api/resources/:id`

### Volunteers
- `GET /api/volunteers`
- `POST /api/volunteers`
- `PATCH /api/volunteers/:id`
- `DELETE /api/volunteers/:id`

### Shelters
- `GET /api/shelters`
- `POST /api/shelters`
- `PATCH /api/shelters/:id`
- `DELETE /api/shelters/:id`

### Alerts
- `GET /api/alerts`
- `POST /api/alerts/dispatch`
- `DELETE /api/alerts/:id`

### Logs
- `GET /api/logs?limit=100`
- `POST /api/logs`

### Settings / Checklist
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/checklist`
- `PUT /api/checklist`

### Utility
- `POST /api/reset` (reset seeded database)

## Example Payloads

Create report:

```json
{
  "type": "SOS — People Trapped",
  "location": "NH-27 near Khumtai",
  "severity": "Critical",
  "description": "Family trapped on first floor",
  "source": "APP"
}
```

Dispatch alert:

```json
{
  "title": "Flash Flood Warning",
  "message": "Evacuate to nearest shelter immediately",
  "severity": "EMERGENCY",
  "channels": ["APP PUSH", "SMS", "USSD"],
  "targetPopulation": 25000
}
```
