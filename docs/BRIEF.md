# Clearway

AI screening of US airports for terminal investment

**Live demo:** [clearway-jade.vercel.app](https://clearway-jade.vercel.app)\
**Code and design document:** [github.com/eliran0220/clearway](https://github.com/eliran0220/clearway)

## The problem

An investor in airport modernization needs to know which US airports are worth expanding. The evidence exists, but it is spread across federal datasets on traffic, routes, delays and live airport status, and pulling it together to answer one question can take an analyst days.

## What Clearway is

A chat assistant for those analysts. Ask in plain English or by voice, and within about half a minute you get a direct answer, a card with the numbers and a chart, and the sources behind them. Follow-ups such as "put less weight on delays" or "now use 5,000 km" re-run the analysis.

## What you can ask

- **Where to expand.** "Which airports in New England are strong candidates for terminal expansion?" ranks a region's airports with a screening score.
- **How congested.** "Compare LA and Santa Ana congestion levels" compares delays, their causes and documented capacity caps, with the current FAA status.
- **How far flights go.** "What is the percentage of long-haul flights out of Anchorage?" counts departures by distance, with or without cargo.
- **Where demand outruns capacity.** "What is the unmet flight demand at SFO and why?" checks four demand signals and the limits behind them.

## How it works

1. **Understand.** Claude reads the question and picks the right analysis.
2. **Calculate.** Fixed, tested code computes every number from official public data: the BTS traffic API, BTS route and delay files, and live FAA and weather feeds.
3. **Explain.** Claude explains the result; the card shows its period, sources and confidence. The AI never produces a number.

## The score in short

Each airport earns up to 100 points: demand growth 35, how full the planes are 30, delay pressure 20, and passengers outgrowing the seats airlines offer 15. Each measure is scored on a fixed scale, so an airport's score does not depend on which airports it is compared with. A high score means "worth a terminal-capacity study", not "profitable": public data has no construction costs or airport revenues. Every weight, range and signal is in the **Methodology** panel in the app.

## Why you can trust it

Every answer shows its period, sources and confidence, and says what the data cannot show. Questions about returns or costs are declined, with the data they would need. Automated tests and an evaluation of the exercise questions check that no answer quotes a number the code did not produce.
