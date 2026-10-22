# Clearway

An AI agent that helps analysts screen US airports for terminal investment. Claude chooses which analysis to run; plain TypeScript and SQL compute every number; each answer shows its period, sources, assumptions and confidence.

**Live demo: [clearway-jade.vercel.app](https://clearway-jade.vercel.app)** (no sign-in; 20 questions per 10 minutes per visitor).

Built for the Deloitte Digital Forward Deployed Engineer exercise "Airport Investment Intelligence Agent". In brief: [docs/SUMMARY.md](docs/SUMMARY.md). Design and tradeoffs: [docs/DESIGN.md](docs/DESIGN.md).

## Status

| Part | State |
| --- | --- |
| Deterministic metrics and screening score (`packages/core`) | Done, 35 unit tests |
| Database schema and migrations (`packages/db`) | Done, applied to Neon |
| BTS monthly API adapter and daily refresh job (`apps/api`) | Done, tested on real API rows |
| T-100 Segment, Delay Causes and OurAirports importers | Done, run on the full real exports |
| Agent: 7 tools, system prompt, streaming `/chat` route, terminal client | Done, 58 unit tests |
| Curated constraints (SNA passenger cap, SFO arrival limits) | Done, `data/constraints.json` |
| Evaluation (`npm run eval`) | 8 of 8 turns pass |
| Web app (`apps/web`): chat, result cards, evidence, browser voice | Done, tested in Chrome (desktop, phone width, light and dark), 5 unit tests |
| Sanity check (`npm run smoke`) | Done |
| Deploy (Vercel + AWS via SST) | Live: web on Vercel, API and daily refresh on AWS us-east-2 |

## Layout

```text
apps/web/        Next.js page: chat, result cards with evidence, methodology, browser voice
apps/api/        Hono API for AWS Lambda: /health, /meta, /chat (agent), daily refresh job
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

### Importing the official files

Download the exports from BTS TranStats, then unzip each into its own folder under `data/raw/` (git ignores it; both T-100 zips contain a file with the same name):

```bash
mkdir -p data/raw/t100-2025 data/raw/t100-2026 data/raw/delays
unzip ~/Downloads/T_T100_SEGMENT_ALL_CARRIER_<2025 export>.zip -d data/raw/t100-2025
unzip ~/Downloads/T_T100_SEGMENT_ALL_CARRIER_<2026 export>.zip -d data/raw/t100-2026
unzip ~/Downloads/ot_delaycause1_DL.zip -d data/raw/delays

npm run data:import -- airports
npm run data:import -- t100 data/raw/t100-2025/T_T100_SEGMENT_ALL_CARRIER.csv data/raw/t100-2026/T_T100_SEGMENT_ALL_CARRIER.csv
npm run data:import -- delays data/raw/delays/Airline_Delay_Cause.csv
```

Re-running an import is safe: T-100 replaces the months in the files, delays and airports are upserted. Every import is recorded in `source_fetches`.

Curated constraints (each with a source URL and an as-of date) live in `data/constraints.json`:

```bash
npm run data:import -- constraints
```

### Running the web app locally

```bash
cp apps/web/.env.example apps/web/.env.local   # points the page at http://localhost:8787
npm run dev:api                                  # terminal 1: the API
npm run dev:web                                  # terminal 2: the page, http://localhost:3000
```

Voice input uses the browser's speech recognition (Chrome, Edge, Safari). Answers to spoken questions are read aloud.

### Talking to the agent from the terminal

```bash
npm run ask -- "Which airports in New England are strong candidates for terminal expansion?"
npm run ask                    # interactive, with follow-ups; type "exit" to quit
```

It prints each tool call with its inputs, then the answer.

### Evaluation

```bash
npm run eval                   # all scenarios: the 4 exam questions, follow-ups, an out-of-scope question
npm run eval -- anchorage      # one scenario
npm run eval -- --verbose      # print every answer
```

A turn fails if the expected tool or argument is missing, or if the answer contains a number that no tool returned.

### Sanity check

Run after any change and after every deploy. It checks the API is up, the data is loaded, CORS admits the web app, bad requests are refused, and each exam question runs its tool end to end (four model calls).

```bash
npm run smoke                                                     # local: API on :8787, web origin http://localhost:3000
npm run smoke -- --api https://<lambda-url> --web https://<app>.vercel.app
npm run smoke -- --quick                                          # one question instead of four
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
