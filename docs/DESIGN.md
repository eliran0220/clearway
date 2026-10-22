# Clearway design

Living document; it becomes the short design note submitted with the code.

## 1. Problem and scope

An investment firm wants to know which US airports are worth a closer look for terminal expansion. Clearway is a screening assistant: it ranks and compares airports on traffic pressure and explains why. It does not estimate ROI, construction cost or feasibility; a high score means "worth a terminal-capacity study".

## 2. Architecture

- **Web app:** Next.js on Vercel (chat, tool cards, browser voice).
- **API:** Hono on AWS Lambda behind a streaming Function URL, deployed with SST to us-east-2.
- **Daily job:** EventBridge (SST `CronV2`) at 06:15 UTC upserts the newest BTS monthly airport traffic.
- **Database:** Postgres on Neon (AWS us-east-2), Drizzle ORM, HTTP driver (no connection pool in Lambda).
- **Agent:** Claude via the Vercel AI SDK with typed tools. The model chooses tools and explains results; it never computes numbers.

## 3. Data and windows

| Source | Access | Latest month seen (22 Oct 2026) |
| --- | --- | --- |
| BTS T-100 Segment Summary by Origin Airport | Public API, daily refresh | April 2026 |
| BTS T-100 Segment, All Carriers | File export | July 2026 |
| BTS Delay Causes | File export | August 2026 |

Comparisons that combine sources use the same 12 complete months for every airport (default May 2025 to April 2026, against the 12 months before for growth). An airport missing months is shown as not scored, never zero-filled. A single-source question may use that source's latest 12 months, labeled.

## 4. Methodology (screening-v1)

Formulas live in `packages/core` with unit tests. Summary:

- Growth = recent 12 months / previous 12 months - 1, for passengers and seats; supply gap = passenger growth - seat growth.
- Load factor = sum of passengers / sum of seats (never an average of percentages).
- Congestion: arrivals delayed 15+ minutes / arrivals, cancellations / arrivals, NAS share of delay minutes, from summed counts.
- Long-haul share = departures performed on routes of 4,000 km or more / all departures; threshold and scope (all services or scheduled passenger) are parameters.
- Expansion screening score: four components on fixed ranges, weights 35/30/20/15 (growth, occupancy, delays, supply gap). Missing component = not scored; no silent re-weighting.

Thresholds and weights are illustrative and uncalibrated. Open calibration point: real SFO monthly load factor is 80 to 85%, so a fixed 85% "planes are full" threshold may be too strict; compare to the national median for the same months instead.

## 5. Where AI is used

To be completed with the agent: tool list, system prompt rules, the provenance check (every number in an answer must appear in a tool result), and the step limit.

## 6. Tradeoffs and decisions

| Decision | Why | Alternative |
| --- | --- | --- |
| API + official file imports | No free API has route distances or delay causes per airport | API-only would drop two of the four sample questions |
| Neon over Aurora Serverless v2 | Free, fast wake-up, HTTP driver for Lambda; Aurora resumes in about 15 to 30 s | Aurora for an all-AWS production client: same Postgres, change the connection string |
| Lambda region us-east-2 | Neon project is in us-east-2 | |
| CORS in Hono only | The Function URL's default CORS plus middleware would send duplicate headers | |
| npm workspaces | No extra tooling on Node 26 | pnpm |
| Browser voice first | Free and no backend; server transcription only if browser voice falls short | |
| Fixed score ranges | A score does not change when other airports are added | Min-max within the group |
