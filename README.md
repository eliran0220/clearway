# Clearway

An AI agent that helps analysts screen US airports for terminal investment. Claude chooses which analysis to run; plain TypeScript and SQL compute every number; each answer shows its period, sources, assumptions and confidence.

**Live demo: [clearway-jade.vercel.app](https://clearway-jade.vercel.app)** (no sign-in; 20 questions per 10 minutes per visitor).

Built for the Deloitte Digital Forward Deployed Engineer exercise "Airport Investment Intelligence Agent".

| Document | For |
| --- | --- |
| [Clearway brief (one-page PDF)](docs/Clearway-Brief.pdf) | Anyone: the problem, what Clearway does, how it works, the score in short |
| [docs/DESIGN.md](docs/DESIGN.md) | Engineers: how we built it, stack, scoring methodology, where AI is used, testing, tradeoffs, limits, next steps |
| Methodology panel in the app | Anyone using the demo: every weight, range and signal |

## Quality

98 unit tests (`npm test`), an agent evaluation of the exam questions and follow-ups that fails any answer quoting a number no tool returned (`npm run eval`, 8 of 8), and a sanity check against local or live URLs (`npm run smoke`). CI runs the typecheck, the tests and a production build of the web app on every push.

## Layout

```text
apps/web/        Next.js page: chat, result cards with evidence, methodology, browser voice
apps/api/        Hono API for AWS Lambda: /health, /meta, /chat (agent), daily refresh job
packages/core/   metrics, screening score, evidence envelope (no I/O)
packages/db/     Drizzle schema and Neon client
docs/            DESIGN.md (technical design) and the one-page brief (PDF)
sst.config.ts    AWS deploy: API Lambda (streaming URL) + daily cron, us-east-2
```

## Setup

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env          # then fill DATABASE_URL and ANTHROPIC_API_KEY
npm test                      # unit tests
npm run typecheck
npm run db:migrate            # creates the tables in Neon (migrations are committed; run db:generate only after a schema change)
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

## Deploying

The API and the daily job deploy to AWS with SST (region us-east-2, next to the Neon database); the web app deploys to Vercel.

```bash
# AWS credentials configured locally (aws configure), then once per stage:
npx sst secret set AnthropicApiKey "<key>" --stage prod
npx sst secret set DatabaseUrl "<neon connection string>" --stage prod
npx sst secret set AllowedOrigins "https://<app>.vercel.app,http://localhost:3000" --stage prod
npm run deploy                # prints apiUrl
```

On Vercel, import the repo with Root Directory `apps/web` and set `NEXT_PUBLIC_API_URL` to the `apiUrl` (no trailing slash). Vercel redeploys on every push; the API changes only when `npm run deploy` runs. Then run the sanity check against both URLs.

## Data sources

| Source | Access | Used for |
| --- | --- | --- |
| BTS T-100 Segment Summary by Origin Airport (`r495-tyji`) | Public JSON API, refreshed daily | Passengers, seats, growth, load factor |
| BTS T-100 Segment, All Carriers | Official file export, imported (re-import to refresh) | Route distances, long-haul share |
| BTS Airline On-Time Delay Causes | Official file export, imported (re-import to refresh) | Delay and congestion metrics |
| OurAirports | Public CSV | Airport names, states, coordinates |
| FAA NAS Status | Public XML feed, live | Current delay programs and ground stops |
| NOAA Aviation Weather METAR | Public JSON API, live | Current weather |

Imported files are labeled as files everywhere; they are never described as APIs.
