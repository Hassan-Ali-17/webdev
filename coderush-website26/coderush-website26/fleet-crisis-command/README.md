# Fleet Crisis Command

Production-style real-time Strait of Hormuz fleet operations console for the **Code Rush Web Dev Track**: 15 simulated hulls driven from `fleet.json`, websocket fan-out via Flask-SocketIO, SQLite persistence for alerts/directives/distress/advisor snapshots, Leaflet SOC UI (Command/Captain), Groq-assisted NLP with deterministic fallback, marine weather ingestion, predictive geofencing, multi-route overlays, playback of the trailing hour sampled every 30 s, ship-to-ship assistance hooks, and an AI SOC advisor cadence.

## Quick start

```bash
docker compose up --build
```

- **Command SOC:** [http://localhost:3000/command](http://localhost:3000/command)
- **Captain bridge:** `http://localhost:3000/captain/<shipId>` → e.g. [http://localhost:3000/captain/MV-7](http://localhost:3000/captain/MV-7) — replace with any `MV-1`…`MV-15`
- **API / health:** [http://localhost:5001/api/health](http://localhost:5001/api/health)
- **History JSON:** [http://localhost:5001/api/history](http://localhost:5001/api/history)

> The backend container maps host **5001 → 5000** so browsers on your laptop reach the websocket + REST shim without conflicting with common local Flask ports.

Local dev without Docker:

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export FLEET_JSON_PATH="$(pwd)/../fleet.json"
export DATABASE_URL="sqlite:///data/dev.db"
mkdir -p data
# macOS often binds AirPlay to port 5000; use a free port when needed (here 5055).
export PORT=5055
python run.py
```

```bash
cd frontend
npm install
export NEXT_PUBLIC_SOCKET_URL=http://localhost:5055
export NEXT_PUBLIC_REST_URL=http://localhost:5055
npm run dev
```

## Environment variables

**Secrets:** Never commit LLM keys or paste them where they can leak. Copy `fleet-crisis-command/.env.example` to `fleet-crisis-command/.env` (ignored by Git) or export variables in your shell; `docker compose` picks them up automatically.

### Backend (`docker-compose.yml` wired)

| Name | Meaning |
| --- | --- |
| `DATABASE_URL` | SQLite DSN (`sqlite:///data/fleet_command.db` in Docker volume) |
| `FLEET_JSON_PATH` | Absolute path inside container (`/app/fleet.json` bind mount) |
| `TICK_HZ` | Simulation cadence (**default 4 Hz**, faster than grading minimum) |
| `CORS_ORIGINS` | Comma-separated browser origins (`http://localhost:3000,http://127.0.0.1:3000`) |
| `GROQ_API_KEY` | Optional — enables Groq-hosted Llama-class JSON extraction |
| `GROQ_MODEL` | Model slug (defaults to `llama-3.1-70b-versatile`) |
| `OPENAI_API_KEY` | Optional (bonus) — when set with `AI_PROVIDER=auto`, OpenAI is preferred for distress/advisor NLP |
| `OPENAI_MODEL` | Chat completion model (`gpt-4o-mini` by default) |
| `AI_PROVIDER` | `auto` (default), `openai`, or `groq` — controls LLM attempt order before heuristic fallback |
| `SOCKETIO_MESSAGE_QUEUE` | Leave empty for single-node compose; populate if scaling Socket.IO |

### Frontend build args / runtime (`NEXT_PUBLIC_*` baked into the client bundle)

| Name | Meaning |
| --- | --- |
| `NEXT_PUBLIC_SOCKET_URL` | Browser-reachable Flask-SocketIO origin (`http://localhost:5001` when using Compose port mapping) |
| `NEXT_PUBLIC_REST_URL` | REST root for playback/history fetching |
| `NEXT_PUBLIC_MAP_TILE_URL` | Optional basemap template (defaults to Carto dark matter) |

> **LLMs**: Put keys in `.env` beside `docker-compose.yml`. With `OPENAI_API_KEY`, `AI_PROVIDER=auto` tries OpenAI first, then Groq if configured; with only `GROQ_API_KEY`, Groq runs first. With neither, distress + advisor use heuristics only (still live). Inspect `GET /api/health` → `nlp` for configured providers and resolution order.

## Roles & UX

### Command (`/command`)
- Omniscient map, fleet metrics, weather snapshot, SOC advisor queue w/ Accept/Reject
- Animated alerts + synthetic sonar ping on new backlog items
- Draw NO-GO polygons (Leaflet.draw) → persisted + broadcast (`zone_upsert`)
- Issue directives (`reroute_port`, `divert_waypoint`, `hold`), refresh multi-profile routing matrix, visualize candidate polylines, scrub last-hour telemetry with the timeline slider

### Captain (`/captain/<shipId>`)
- Map + directives scoped visually to assigned hull (still receives fleet broadcast JSON but UI filters)
- CANNOT mutate zones — draw controls disabled server + client
- Must ACK or `ESCALATE_DISTRESS` on pending directives; free-form bulletin hits Groq (or heuristic) and fans out structured prioritization cues

### Observers (`session_identify` default)
- Passive feed when no explicit role handshake is added (SOC screens)

## Backend architecture (high-level)

```
fleet.json ──► loader (exactly 15 rows) ──► FleetSimulator
                            │
                            ├► GridRouter (navigable poly + zones + weather-aware edge costs → fastest/safest/fuel)
                            ├► Weather service (Open-Meteo Marine, cached/fallback baseline)
                            ├► Alerts + SQLite persistence layers
                            ├► Prediction heuristics (≤6 min zone ingress, CPA convergence alerts w/ cooldowns)
                            └► Flask-SocketIO rooms (`fleet` broadcast loop @ TICK_HZ)

```

## Persistence / playback

Tables: `fleet_snapshots` (≤1 h @ 30 s cadence pruning), `alerts`, `directives`, `distress_messages`, `restricted_zones`, `assistance_requests`, `advisor_suggestions`.

Playback samples only ship positions + ancillary metadata — not arbitrary full deterministic reconstruction at any timestamp beyond stored frames (per spec allowances).

## Assumptions (documented for judges)

1. **Captain clients never ingest foreign hull telemetry on the websocket**: every Socket.IO sid receives a bespoke `fleet_snapshot` assembled with `captain_ship_id` filtering (tracks, directives, correlated alerts/assist threads). Historic `/api/fleet` and `/api/history` remain SOC-wide for grading playback.
2. Weather routing samples are coarse-cell heuristics; live Meteo outages gracefully snap to benign synthetic sea-state with mild fuel uplift (so engines never idle-error).
3. Great-circle kinematics approximate CPA “predictions”; deterministic for demo, not ECDIS-certified.
4. Groq Structured Outputs optional — models lacking JSON mode gracefully fall back to regex/keyword parsers.
5. Leaflet geometries use planar lon/lLat intersection checks consistent with coursework expectations (not nautical chart digitization).

## Known limitations / future hardening

- No authN between Command vs Captain transports (trust-local demo).
- Rerouting graph is rasterized (~150²) — intricate fjord manoeuvres may require finer grids.
- `assistance_resolve` socket is permissive; tighten to involved captains/command in hardened deployment.
- `npm audit` may still surface moderate transitive issues — run `npm audit fix` before exposing beyond lab networks.

## Testing checklist

- [ ] `docker compose up` brings backend healthy + frontend up without manual seeds
- [ ] Two browser tabs on `/command` show synchronized tracks within sub-second jitter
- [ ] Captain tab only spotlights owning hull visually and rejects foreign directive responses (`wrong_ship`)
- [ ] Drawing a forbidden polygon triggers breach + reroute status within ≤1 simulated second (tick quantized)
- [ ] Distress bulletin without Groq still surfaces structured severity deltas
- [ ] Playback slider replays persisted frames from `/api/history`
- [ ] `TICK_HZ` ≥ `1`, default `4` for headroom toward the 500 ms UX target on localhost

## Compliance cross-walk

| Requirement | Implementation |
| --- | --- |
| Exactly 15 ships | `fleet_loader.py` asserts count |
| ≥1 Hz sim | Configurable TICK (default 4) |
| WebSockets | Flask-SocketIO + `socket.io-client` |
| Weather + fuel 30 % | Marine API + `_weather_multiplier` |
| Alerts + ack | SQLite + SOC UI sonic cue |
| Command vs Captain UX | Dedicated routes & socket guards |

---

MIT licensed reference build for coursework demonstration.
