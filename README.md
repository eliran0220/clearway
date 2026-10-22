# Clearway

An AI agent that helps analysts screen US airports for terminal investment. Claude chooses which analysis to run; plain TypeScript and SQL compute every number; each answer shows its period, sources, assumptions and confidence.

Built for the Deloitte Digital Forward Deployed Engineer exercise "Airport Investment Intelligence Agent". Design and tradeoffs: [docs/DESIGN.md](docs/DESIGN.md).

## Status

| Part | State |
| --- | --- |
| Deterministic metrics and screening score (`packages/core`) | Done, 30 tests |
| Database schema (`packages/db`) | Done, migrations to generate |
| BTS monthly API adapter and daily refresh job (`apps/api`) | Done, tests on real API rows |
| T-100 Segment and Delay Causes importers | Next |
| Agent tools and chat route | Next |
| Web app (`apps/web`) | Later |

## Layout

```text
apps/api/        Hono API for AWS Lambda: /health, /chat (agent), daily refresh job
packages/core/   metrics, screening score, evidence envelope (no I/O)
packages/db/     Drizzle schema and Neon client
docs/            DESIGN.md
sst.config.ts    AWS deploy: API Lambda (streaming URL) + daily cron, us-east-2
```

## Setup

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env          # then fill DATABASE_URL and ANTHROPIC_API_KEY
npm test                      # unit tests
npm run typecheck
npm run db:generate           # creates SQL migrations from the schema
npm run db:migrate            # applies them to Neon
npm run data:refresh          # loads BTS monthly airport traffic (first run backfills from 2023-01)
npm run dev:api               # http://localhost:8787/health
```

## Data sources

| Source | Access | Used for |
| --- | --- | --- |
| BTS T-100 Segment Summary by Origin Airport (`r495-tyji`) | Public JSON API, refreshed daily | Passengers, seats, growth, load factor |
| BTS T-100 Segment, All Carriers | Official file export, imported once | Route distances, long-haul share |
| BTS Airline On-Time Delay Causes | Official file export, imported once | Delay and congestion metrics |
| OurAirports | Public CSV | Airport names, states, coordinates |
| FAA NAS Status | Public XML feed, live | Current delay programs and ground stops |
| NOAA Aviation Weather METAR | Public JSON API, live | Current weather |

Imported files are labeled as files everywhere; they are never described as APIs.
