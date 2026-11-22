# Tumakuru Rapid Response 🚑🚒🚔

> **A guest-first emergency help requester and live tracker for Tumakuru (Tumkur), Karnataka, India.**

> [!WARNING]
> **This is a simulation with virtual units.** In a real emergency, call **112**.

![Demo](https://img.shields.io/badge/status-simulation-orange)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20MongoDB-blue)

---

## 60-Second Demo Script

1. Open http://localhost:5173 — map loads centered on Tumakuru
2. Allow location (or search for "Tumkur Bus Stand")
3. Tap the red **"Get Help"** button
4. Select **Medical** → type "Demo test" → tap **"Request Help"**
5. Watch: an ambulance is dispatched from the nearest hospital
6. The unit moves along real roads toward you with a live ETA countdown
7. Status steps progress: Received → Assigned → En Route → Arriving → Arrived
8. On arrival, a celebration screen appears. The unit returns to base.
9. Try again with Fire or Police — different units, different stations!
10. Toggle dark mode 🌙 or switch to ಕನ್ನಡ

---

## Architecture

```
┌────────────────────────┐     ┌──────────────────────────────┐
│   React + Vite Client  │────▶│  Express + Socket.IO Server  │
│                        │◀────│                              │
│  • react-leaflet map   │ WS  │  • MongoDB (or in-memory)    │
│  • framer-motion UI    │     │  • Dispatch engine            │
│  • Socket.IO client    │     │  • OSRM routing              │
│  • Tailwind CSS        │     │  • 1Hz simulation loop       │
│  • i18n (EN + ಕನ್ನಡ)   │     │  • Zod validation            │
└────────────────────────┘     └──────────────────────────────┘
                                         │
                               ┌─────────┴─────────┐
                               │                   │
                          ┌────▼────┐        ┌─────▼─────┐
                          │ MongoDB │        │   OSRM    │
                          │ 2dsphere│        │  (public) │
                          └─────────┘        └───────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, react-leaflet, Framer Motion, Tailwind CSS |
| Backend | Node.js, Express 4, Socket.IO 4, Mongoose 8, Zod |
| Database | MongoDB with 2dsphere indexes (or mongodb-memory-server) |
| Routing | OSRM public demo server (with straight-line fallback) |
| Geocoding | Nominatim (rate-limited, Tumakuru bbox restricted) |
| Maps | Carto Voyager (light) / Carto Dark Matter (dark) |
| Fonts | Space Grotesk (display) + Inter (body) |

## Setup

### Prerequisites
- **Node.js** 18+
- **MongoDB** (optional — uses in-memory DB if `MONGO_URI` is unset)

### Install & Run

```bash
# Clone and install
cd MAJOR
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Configure (optional)
cp .env.example .env
# Edit .env to set MONGO_URI if you have MongoDB

# Seed facilities from OpenStreetMap (one-time, needs network)
npm run seed

# Start dev servers (client + server concurrently)
npm run dev
```

The app opens at **http://localhost:5173** with the API at **http://localhost:3001**.

### Three-Device Dispatch Demo

Use one computer as the dispatcher and two other devices as requesters on the same Wi-Fi network. In PowerShell, start the server and client in separate terminals from the project root:

```powershell
# Terminal 1: run this project's API on 3002 if another app already uses 3001
$env:PORT = "3002"
Set-Location server
npm run dev
```

```powershell
# Terminal 2: expose the client on the local network and proxy it to this API
$env:API_PROXY_TARGET = "http://localhost:3002"
Set-Location client
npm run dev -- --host 0.0.0.0
```

On the dispatcher computer, open **http://localhost:5173/admin**. On both requester devices, open **http://\<dispatcher-LAN-IP\>:5173** (find the IP with `ipconfig`). Keep all three pages connected to the same host; the client proxies API and Socket.IO traffic through that host.

1. On requester 1, tap **Get Help**, choose a service, set the incident location, and submit the request.
2. Repeat on requester 2 with a different location or service.
3. Use the dispatcher dashboard's **Requests** and **Fleet & Units** tabs to monitor both requests and dispatch status.
4. Follow each request independently on its requester device.

Allow Node.js/Vite through the host computer's firewall for private networks. This is a simulation with virtual units; call **112** in a real emergency.

### Without MongoDB

If `MONGO_URI` is not set, the server automatically:
1. Starts an in-memory MongoDB instance
2. Seeds it with facility data
3. Creates virtual units (2 per facility)

No external database needed!

### Re-seed Facilities

```bash
# Fetch fresh data from OpenStreetMap Overpass API
npm run seed

# This queries hospitals, fire stations, and police stations
# in the Tumakuru bounding box and saves to server/data/facilities.json
```

If Overpass is unavailable, the seed falls back to `server/data/fallback-facilities.json`.

## Data Model

```
Facility { name, type, position (GeoJSON), address, phone, source }
    └── 2dsphere index on position

Unit { type, unitId, homeFacilityId, status, position (GeoJSON), heading }
    ├── status: available | assigned | en_route | on_scene | returning
    └── 2dsphere index on position

Request { type, note, location, address, status, assignedUnitId, route,
          etaSeconds, distanceMeters, trackingToken, timeline[], createdAt }
    └── status: queued | assigned | en_route | arriving | arrived | completed | cancelled
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/requests` | Create request + auto-dispatch |
| `GET` | `/api/requests/:id?token=` | Get request status |
| `POST` | `/api/requests/:id/location?token=` | Update user location |
| `POST` | `/api/requests/:id/cancel?token=` | Cancel request |
| `GET` | `/api/facilities` | List facilities (?type= filter) |
| `GET` | `/api/geocode?q=` | Search places (Nominatim) |
| `GET` | `/api/reverse?lat=&lng=` | Reverse geocode |
| `GET` | `/api/health` | Health check |

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join` | Client → Server | Join request room |
| `request:update` | Server → Client | Request status change |
| `unit:position` | Server → Client | Unit position (1 Hz) |

## Dispatch Algorithm

1. Map request type → unit type (medical→ambulance, fire→fire_engine, police→patrol)
2. Find 5 nearest **available** units using MongoDB `$geoNear` (2dsphere index)
3. Get OSRM road routes for all candidates in parallel
4. Sort by ETA → distance → unit ID (tie-break)
5. Atomically claim with `findOneAndUpdate` (prevents race conditions)
6. If claim fails, retry with next candidate
7. If no units free: FIFO queue with auto-assign on release

## Simulation

- Units move along OSRM road routes at realistic city speeds:
  - 🚑 Ambulance: 45 km/h
  - 🚒 Fire engine: 40 km/h
  - 🚔 Police patrol: 50 km/h
- Position, heading, ETA, and distance update every second
- Arrival triggers on-scene pause → completion → return to base
- Returning units can be reassigned if they're closest

## Design System

- **8px spacing grid** with CSS custom properties
- **Semantic colors**: Medical red, Fire orange, Police blue
- **Dark + Light themes** (auto-detects system, manual toggle)
- **Glass morphism** panels with backdrop blur
- **Custom SVG markers** per service type
- **44px minimum touch targets** (WCAG AA)
- **`prefers-reduced-motion`** respected
- **ARIA live regions** for status announcements
- **Keyboard navigable** throughout

## i18n

Supports English and Kannada (ಕನ್ನಡ). Toggle in the top-right corner.

All core flow strings are translated:
- SOS prompt, service selection, status steps
- ETA announcements, queue messages, error states
- Facility labels, map legend

## Tests

```bash
cd server
npm test
```

Tests cover:
- Nearest-available selection with tie-breaks
- Type matching (medical→ambulance, etc.)
- Atomic claim race condition prevention
- Queue FIFO ordering
- Route interpolation and distance calculation
- Heading computation
- ETA/remaining distance computation

## Security

- **Helmet** security headers
- **CORS** allowlist
- **Rate limiting** (200 req/15min general, 3 req/min for request creation)
- **Zod** input validation
- **Token-based** guest access (no login required)
- **No secrets committed** (`.env.example` provided)

## Project Structure

```
MAJOR/
├── client/
│   ├── src/
│   │   ├── components/     # React components (map, tracking, UI)
│   │   ├── hooks/          # Custom hooks (theme, location, socket, tracking)
│   │   ├── i18n/           # English + Kannada translations
│   │   ├── styles/         # Design tokens + Tailwind
│   │   └── utils/          # Constants, markers, helpers
│   ├── tailwind.config.js
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── models/         # Mongoose schemas (Facility, Unit, Request)
│   │   ├── routes/         # Express routes (facilities, requests, geocode)
│   │   ├── services/       # Business logic (dispatch, OSRM, simulation, queue)
│   │   ├── __tests__/      # Jest unit tests
│   │   ├── db.js           # MongoDB connection
│   │   ├── seed.js         # Overpass seed script
│   │   └── index.js        # Server entry point
│   └── data/               # Facility data (seeded from OSM)
├── .env.example
├── .gitignore
└── README.md
```

## Out of Scope

Admin console, user accounts, roles, AI triage, payments, native apps, real vehicle GPS.

---

**Built for Tumakuru** 🇮🇳 | **Demo only** — In a real emergency, call **112**
