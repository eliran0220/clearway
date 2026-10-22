# Clearway in brief

Clearway is an AI agent that helps analysts screen US airports for terminal investment. Claude reads the question, picks an analysis and explains the result; deterministic TypeScript computes every number from public aviation data, and each answer shows its period, sources, assumptions and confidence. Live demo: [clearway-jade.vercel.app](https://clearway-jade.vercel.app). Methodology and tradeoffs in detail: [DESIGN.md](DESIGN.md).

## How we worked

1. **Research and plan.** We read the brief, surveyed free public aviation sources, and cross-checked the findings with a second model (ChatGPT) before choosing any.
2. **Proof of concept.** A separate POC project called the real endpoints (the BTS traffic API, the BTS file exports, the FAA status feed and NOAA weather) to confirm fields, coverage and freshness. It showed that no free API has route distances or delay causes, which is why two sources are official file imports.
3. **Implementation plan.** The POC results went into one plan: architecture, scoring formula, data windows, deployment and test strategy, with each decision recorded.
4. **Build and verify.** We built in stages with unit tests, then a model evaluation that fails any answer quoting a number no tool returned, a browser test pass at desktop and phone width, a sanity check against running URLs, and a full code review.

## Stack

| Layer | Choice | Why | Instead of |
| --- | --- | --- | --- |
| Language | TypeScript throughout, npm workspaces | One language and shared types across the agent, scoring and UI; one repo, one CI | Python with pandas: stronger data tooling, but a second language and deploy |
| Agent | Claude (Sonnet) via the Vercel AI SDK | Typed tools validated with Zod, a bounded tool loop, streaming straight into React | LangChain or LangGraph: more abstraction than one tool loop needs. RAG: answers are calculations over tables, not document search |
| Scoring | Plain TypeScript package with unit tests | Deterministic, explainable component by component, identical in every client | Ranking by the model: not reproducible |
| API | Hono on AWS Lambda, streaming Function URL | Small, fast cold start, streams answers, pay per request | A server on EC2 or Fargate: always-on cost for a demo |
| Infrastructure | SST | Lambda, the daily cron and secrets in one TypeScript file | CDK or Terraform: more code for the same resources |
| Database | Postgres on Neon, Drizzle ORM | Airport-by-month data is relational; SQL aggregates; the HTTP driver suits Lambda; free tier, scales to zero | Aurora Serverless v2: all-AWS but slower to wake. MongoDB: the data is tabular and joined |
| Data | BTS traffic API (refreshed daily), BTS T-100 and delay files, FAA and NOAA live feeds, OurAirports, sourced constraints | Public, official and citable | Paid feeds such as OAG or Cirium: richer, but not public |
| Web | Next.js, React and Tailwind on Vercel | First-class Next hosting with a preview per push; tool results render as cards | A single-page app on S3 and CloudFront: workable, more wiring |
| Voice | Browser Web Speech API | Free, and no audio leaves the browser | Server transcription: cost and audio handling for a bonus feature |
| Quality | Vitest, model evaluation, sanity check, GitHub Actions | Logic, agent behavior and the deployed wiring are each tested | |

## Advantages

- Every number is reproducible and traceable to a source, a period and a formula.
- Answers state their assumptions, confidence and what the data cannot show; out-of-scope questions such as ROI are declined with the data they would need.
- Serverless and free tiers keep the running cost close to the model calls alone.
- Small surface: one language, one repo, two cloud services, CI on every push.

## Disadvantages and limits

- It is a screening tool, not an ROI model: public data has no construction costs or airport revenues.
- Route distances and delay causes come from file imports, refreshed by hand; only traffic refreshes daily.
- Score weights and ranges are illustrative, not calibrated against past terminal projects.
- The rate limit is per Lambda instance; production would add a shared limit and sign-in.
- Browser voice works in Chrome, Edge and Safari, not Firefox.
