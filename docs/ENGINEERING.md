# Clearway engineering notes

Clearway is an AI agent that helps analysts at an airport-modernization investor find US airports where more terminal capacity is likely to pay off. The full technical detail behind the one-page [design document](DESIGN.md): how we built it, the architecture and stack, the scoring methodology, where AI is used, testing, tradeoffs and limits. For a non-technical overview, see the [Clearway brief](Clearway-Brief.pdf).

## 1. Problem and scope

The brief asks for airports "where renovations will be most profitable based on increased flight and passenger capacity". Public data has no construction costs, airport revenues or lease terms, so profit cannot be computed honestly. What it does show is the demand side of the case: traffic that is growing, planes that are full, airlines not adding seats as fast as passengers arrive, and operations that are already strained. Those are the conditions in which added terminal capacity earns its keep, so Clearway screens for them.

Clearway therefore ranks and compares airports on demand pressure and explains why. It does not estimate ROI, construction cost or feasibility; a high score means "worth a terminal-capacity study", and the agent says so whenever it is asked about returns.

## 2. How we built it

1. **Research and plan.** We surveyed free public aviation sources and cross-checked the findings with a second model (ChatGPT) before choosing any.
2. **Proof of concept.** A separate POC called the real endpoints (BTS traffic API, BTS file exports, FAA status, NOAA weather) to confirm fields, coverage and freshness. It showed that no free API has route distances or delay causes, so those two sources are official file imports.
3. **Implementation plan.** The POC results went into one plan covering architecture, scoring, data windows, deployment and tests, with each decision recorded.
4. **Build and verify.** Built in stages, each checked by the tests in section 8, then architecture, implementation and code reviews before delivery.

## 3. Architecture and stack

Live: web app at [clearway-jade.vercel.app](https://clearway-jade.vercel.app); API and daily job on AWS us-east-2.

| Layer | Choice | Why | Instead of |
| --- | --- | --- | --- |
| Web app | Next.js, React and Tailwind on Vercel; browser speech for voice | A preview per push; tool results render as cards; no audio leaves the browser | A single-page app on S3: more wiring. Server transcription: cost for a bonus feature |
| API | Hono on AWS Lambda behind a streaming Function URL, deployed with SST | Fast start, streams answers, pay per request | A server on EC2 or Fargate: always-on cost |
| Agent | Claude Sonnet via the Vercel AI SDK, tools typed with Zod | A bounded tool loop that streams into the UI | LangChain: more than one tool loop needs. RAG: answers are calculations over tables, not document search |
| Scoring | Plain TypeScript in `packages/core`, unit-tested | Deterministic and explainable component by component | Ranking by the model: not reproducible |
| Daily job | EventBridge schedule (SST `CronV2`) at 06:15 UTC | Upserts the newest BTS month with no server running | |
| Database | Postgres on Neon (AWS us-east-2), Drizzle ORM, HTTP driver | Relational airport-by-month data, SQL totals, no connection pool in Lambda, scales to zero | Aurora Serverless v2: all-AWS but resumes in about 15 to 30 s. MongoDB: the data is tabular and joined |
| Language and repo | TypeScript, npm workspaces | One language and shared types; no extra tooling | Python: stronger data tools, but a second language and deploy |

## 4. Data and windows

| Source | Access | Latest month seen (22 Oct 2026) |
| --- | --- | --- |
| BTS T-100 Segment Summary by Origin Airport | Public API, daily refresh | April 2026 |
| BTS T-100 Segment, All Carriers | File export | July 2026 |
| BTS Delay Causes | File export | August 2026 |

Comparisons that combine sources use the same 12 complete months for every airport (default May 2025 to April 2026, against the 12 months before for growth). An airport missing months is shown as not scored, never zero-filled. A single-source question may use that source's latest 12 months, labeled.

## 5. Methodology (screening-v1)

Formulas live in `packages/core` with unit tests. Summary:

- Growth = recent 12 months / previous 12 months - 1, for passengers and seats; supply gap = passenger growth - seat growth.
- Load factor = sum of passengers / sum of seats (never an average of percentages).
- Congestion: arrivals delayed 15+ minutes / arrivals, cancellations / arrivals, NAS share of delay minutes, from summed counts.
- Long-haul share = departures performed on routes of 4,000 km or more / all departures; threshold and scope (all services or scheduled passenger) are parameters.
- Expansion screening score: four components on fixed ranges, weights 35/30/20/15 (growth, occupancy, delays, supply gap). Missing component = not scored; no silent re-weighting.
- Flight growth (departures performed, cargo included) is reported next to passenger and seat growth but is not scored: seats already measure the flight capacity airlines add (flights times aircraft size), so scoring flights as well would count capacity twice.

- Demand pressure (the "unmet demand" question): four signals. Planes are full = load factor above the national load factor for the same 12 months (all US airports in the BTS data; if that figure is unavailable, 85% is used and the evidence says so); demand outpacing supply = supply gap above 0; operations strained = delay rate 25% or more, or NAS share above 40%; a documented constraint exists. 0-1 signals low, 2 moderate, 3-4 high.

Score weights and ranges are illustrative and uncalibrated; the score ignores airport size, so each ranked airport also reports its 12-month passengers and the user can raise the eligibility threshold. Calibration decision: "planes are full" was first a fixed 85%, but real SFO monthly load factors run 80 to 85%, so it is now measured against the national load factor for the same months instead of a chosen number. The ranking formula was kept as is, so it stays explainable component by component.

## 6. Where AI is used

Claude (Sonnet, through the Vercel AI SDK) does three things: understands the question, chooses and parameterizes tools, and explains the results. It does not compute, estimate or recall numbers. Everything numeric comes from the tools.

| Tool | Answers | Data |
| --- | --- | --- |
| `resolveAirports` | Names, cities, codes, regions to IATA codes, with assumptions ("LA" means LAX) | OurAirports |
| `getAirportMetrics` | Passengers, seats and flights, their growth, supply gap, load factor, monthly load factor | BTS API |
| `rankExpansionCandidates` | Screening score per airport, every component, airports not ranked and why; weight scenarios | BTS API, Delay Causes |
| `compareCongestion` | Delay, cancellation and NAS share, causes, volume, constraints, which airport is higher per metric | Delay Causes, BTS API, constraints |
| `getLongHaulShare` | Share of departures at or over a threshold, both scopes, distance bands, top destinations | T-100 Segment |
| `assessDemandPressure` | Four signals, pressure level, constraints, what the data cannot show | BTS API, Delay Causes, constraints |
| `getLiveConditions` | FAA delay programs and closures, latest METAR | FAA, NOAA (live, cached 5 and 10 minutes) |

Every tool returns the same evidence envelope (period, sources with retrieval time and kind, assumptions, confidence, warnings, methodology version). Percentages come back rounded to one decimal so the model quotes them exactly.

**Loop and guardrails.** Up to 6 model steps per question. Tool inputs are validated (Zod schemas, IATA codes checked, no free text into SQL). The model has no free SQL, no URL fetching and no file access. Tool output is treated as data, never instructions. The public endpoint has a per-instance rate limit (20 requests per 10 minutes per IP), a 2,000-character cap on each question, a 40-message and 600,000-character cap on the conversation, and only user and assistant messages accepted (a client cannot add system instructions); the hard cost cap is the Anthropic workspace spend limit.

**Follow-ups.** The web client sends the conversation, including earlier tool calls, so "now use 5,000 km" or "less weight on delays" re-runs the tool with one changed argument. Weight changes are partial overrides; the remaining weight is spread over the other components in their default proportions, and the result is labeled as a scenario.

**Why not RAG or LangChain.** Every answer is a calculation over tables, not a search over documents, so retrieval adds nothing. A single tool-calling loop is easier to test, explain and bound than a framework.

**Evaluation.** `npm run eval` runs the four sample questions, their follow-ups ("less weight on delays", "now use 5,000 km", "only passenger flights") and an out-of-scope question (ROI) against the real data and model. A turn fails if the expected tool or argument is missing, or if the answer states a number that appears in no tool result or question (small counts, years and the score scale excepted).

**Conversation hygiene.** Earlier turns' reasoning (thinking) blocks are dropped before a conversation is sent again: each is signed for the request that produced it and is rejected if replayed. Tool calls and results are kept. The system prompt carries today's date so the model can judge whether a live notice is current.

## 7. Interface and voice

One page. The empty state offers the four exam questions. Each answer shows the tools the agent ran (a short trail), the direct answer, a card per result, then the explanation. The cards are: ranking with score components, congestion table with delay causes, long-haul ring with threshold and scope controls, demand-pressure signals with the monthly load factor against the national line, traffic table, and live FAA and weather. Every card ends with its evidence: period, confidence, sources (live API, daily API, official file or curated) with retrieval time, assumptions and warnings. Controls on a card do not recalculate in the browser; they send a follow-up, so the tool recomputes and the evidence stays true.

Voice uses the browser: speech recognition to ask (Chrome, Edge, Safari; hidden where unsupported) and speech synthesis to read the first paragraph of the answer when the question was spoken. No audio reaches our servers. A server transcription fallback was planned only if browser voice fell short.

Look: the Horizon palette (midnight, indigo, sky), Public Sans (the US government's design-system typeface, fitting for federal data), the gradient kept to the logo, the send button and the long-haul ring. Light and dark follow the system setting.

## 8. Testing

- **Unit tests** (100): every formula and the score in `packages/core`, the CSV, BTS and import mappers, the FAA and METAR parsers (including NOTAM validity windows), alias and region resolution, the provenance check, the chat request checks, and the web app's number formatting. CI runs them with the typecheck and a production build of the web app.
- **Evaluation** (`npm run eval`): the four exam questions, three follow-ups and an out-of-scope question against the real data and model; a turn fails on a missing tool or argument, or on any number in the answer that no tool returned. 8 of 8 pass.
- **Sanity check** (`npm run smoke`): after a change or a deploy, checks the API is up, the data is loaded, CORS admits the web app, bad requests are refused, and each exam question runs its tool end to end. It takes about two minutes and costs four model calls.
- **Browser pass**: all questions, follow-ups and card controls run in Chrome at desktop and phone width, in light and dark. It found and fixed an FAA closure misread as expired (the feed's own dates have no year; the NOTAM's validity window is now parsed), internal names leaking into answers, chart colors too close in dark mode and a ranking row that hid passenger counts.

## 9. Tradeoffs and decisions

| Decision | Why | Alternative |
| --- | --- | --- |
| API + official file imports | No free API has route distances or delay causes per airport | API-only would drop two of the four sample questions |
| BTS traffic stored by a daily job, not fetched per question | BTS publishes monthly; one ranking needs two years of many airports plus a national total, which is many paged API calls; stored data answers in milliseconds and survives a BTS outage | Per-question API calls: no fresher, much slower, and fragile. FAA and NOAA, which change by the minute, are fetched per question |
| Lambda region us-east-2 | Neon project is in us-east-2 | |
| CORS in Hono only | The Function URL's default CORS plus middleware would send duplicate headers | |
| Fixed score ranges | A score does not change when other airports are added | Min-max within the group |
| "Planes are full" vs national load factor | A measured benchmark for the same months instead of a fixed 85% | Percentile scoring of every component against all US airports: more statistical, harder to explain |
| Route rows pre-summed in SQL | A busy airport has tens of thousands of carrier, aircraft and month rows; the long-haul math needs only totals per destination | All aggregation in TypeScript: simpler, but slow over the HTTP driver |
| Per-instance rate limit | No extra infrastructure for a demo; the Anthropic spend limit is the hard cap | A shared limit (WAF or a Redis counter) for production |

## 10. Strengths and limits

- **Strengths.** Every number traces to a source, a period and a formula. Answers state their assumptions, confidence and what the data cannot show. Running cost is close to the model calls alone. Small surface: one language, one repo, CI on every push.
- **Limits.** A screening tool, not an ROI model: public data has no construction costs or airport revenues. Route and delay files are refreshed by hand; only traffic refreshes daily. Score weights are reasoned, not calibrated against past terminal projects. The rate limit is per Lambda instance; production would add a shared limit and sign-in. Browser voice works in Chrome, Edge and Safari, not Firefox.

## 11. What we'd build next

- **Watchlist alerts.** Analysts follow airports or regions; when BTS publishes a new month, the existing daily job emails or posts to Slack only what changed ("Portland moved from 3rd to 2nd"), so nobody re-asks the same questions each month.
- **One-click committee memo.** Export any answer as a PDF or Word memo with its cards, sources and assumptions, so numbers reach the investment committee with their evidence attached.
- **FAA forecasts in the score.** Add the FAA Terminal Area Forecast so the ranking weighs projected demand over the next decade, not only the last two years: the closest public data gets to "most profitable".
