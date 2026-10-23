// The agent's tools. Each one validates its input, reads data through the repo, computes through
// @clearway/core, and returns the evidence envelope. Percentages are returned already rounded to one
// decimal (fields ending in Pct), so the model quotes them exactly instead of converting fractions.
import { tool } from 'ai';
import { z } from 'zod';
import {
  SCREENING_V1,
  congestion,
  demandPressure,
  isPassengerService,
  longHaulShare,
  rankCandidates,
  scenarioWeights,
  sumWindow,
  toolResult,
  trafficSummary,
  type Candidate,
  type ComponentKey,
  type SourceRef,
} from '@clearway/core';
import type { Db } from '@clearway/db';
import * as repo from '../data/repo';
import { SOURCES, type SourceId } from '../data/sources';
import {
  byAirport,
  chooseEnd,
  delayCauseShares,
  distanceBands,
  foreignAirportWarnings,
  higherPerMetric,
  matchAliases,
  normalizeCodes,
  rankBySize,
  resolveRegion,
  toCoreDelayRows,
  windowsEndingAt,
} from './analysis';
import { inForceAt, type FaaStatus, type Metar } from './feeds';
import { cachedFetch, fetchFaaStatus, fetchMetars } from './live';

const pct = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1000) / 10);
const pts = (x: number | null | undefined) => (x == null ? null : Math.round(x * 1000) / 10); // fraction -> percentage points
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/).describe('Last month of the 12-month window, YYYY-MM. Omit for the latest available.');
const codesSchema = z.array(z.string()).min(1).max(10).describe('3-letter IATA airport codes, e.g. ["LAX", "SNA"]');

async function sourcesFor(db: Db, ids: SourceId[]): Promise<SourceRef[]> {
  const rows = await repo.latestFetches(db, ids);
  return ids.map((id) => {
    const meta = SOURCES[id];
    const row = rows.find((r) => r.sourceId === id);
    return { id, label: meta.label, kind: meta.kind, url: meta.url, retrievedAt: row ? row.retrievedAt.toISOString() : 'not loaded' };
  });
}

function constraintSources(constraints: { airport: string; kind: string; sourceUrl: string; asOf: string }[]): SourceRef[] {
  return constraints.map((c) => ({
    id: `constraint:${c.airport}:${c.kind}`,
    label: `Curated constraint for ${c.airport} (${c.kind.replace(/_/g, ' ')})`,
    kind: 'curated' as const,
    url: c.sourceUrl,
    retrievedAt: c.asOf,
  }));
}

const nameOf = (rows: { iata: string; name: string }[], code: string) => rows.find((r) => r.iata === code)?.name ?? null;

/** The window for questions that combine BTS traffic (API) with delay data (file). */
async function trafficAndDelayWindow(db: Db, endMonth?: string) {
  const [traffic, delays] = await Promise.all([repo.latestTrafficMonth(db), repo.latestDelayMonth(db)]);
  const { end, warning } = chooseEnd([traffic, delays], endMonth);
  if (!end) throw new Error('Traffic or delay data is not loaded yet.');
  return { win: windowsEndingAt(end), warning };
}

function monthlyLoadFactor(rows: { month: string; passengers: number | null; seats: number | null }[], months: string[]) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((month) => {
    const r = byMonth.get(month);
    return { month, loadFactorPct: r && r.passengers != null && r.seats ? pct(r.passengers / r.seats) : null };
  });
}

export function createTools(getDb: () => Db) {
  return {
    resolveAirports: tool({
      description:
        'Turn airport names, cities, IATA codes or a region (e.g. "New England", "Texas", "CA, OR") into airport codes. Call this first whenever the user names places instead of codes. Returns any assumption made (for example that "LA" means LAX).',
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async ({ query }) => {
        const db = getDb();
        const sources = await sourcesFor(db, ['ourairports']);
        // City aliases and typed codes come first: "LA" is Los Angeles here, not Louisiana's state code.
        const aliases = matchAliases(query);
        const typedCodes = (query.match(/\b[A-Z0-9]{3}\b/g) ?? []).filter((c) => !aliases.codes.includes(c));
        const region = aliases.codes.length === 0 && typedCodes.length === 0 ? resolveRegion(query) : null;
        if (region) {
          const rows = rankBySize(await repo.airportsInRegions(db, region.isoRegions));
          return toolResult(
            {
              region: { label: region.label, states: region.states },
              airports: rows.map((r) => ({ code: r.iata, name: r.name, city: r.city, state: r.region?.replace('US-', '') ?? null, type: r.airportType })),
            },
            { period: null, sources, confidence: 'high', assumptions: ['Airports with scheduled passenger service in OurAirports.'] },
          );
        }
        const assumptions: string[] = [...aliases.assumptions];
        let codes = [...aliases.codes, ...typedCodes];
        let rows = await repo.airportsByCodes(db, codes);
        let confidence: 'high' | 'medium' = 'high';
        if (rows.length === 0) {
          rows = rankBySize(await repo.searchAirports(db, query.trim())).slice(0, 5);
          codes = rows.map((r) => r.iata);
          if (rows.length > 1) {
            confidence = 'medium';
            assumptions.push(`Several airports match "${query.trim()}"; listed largest first. Ask the user if the first is not the one they meant.`);
          }
        }
        const found = new Set(rows.map((r) => r.iata));
        const ordered = codes.filter((c) => found.has(c)).map((c) => rows.find((r) => r.iata === c)!);
        return toolResult(
          { region: null, airports: ordered.map((r) => ({ code: r.iata, name: r.name, city: r.city, state: r.region?.replace('US-', '') ?? null, type: r.airportType })) },
          {
            period: null,
            sources,
            confidence,
            assumptions,
            // Uppercase words that are not airports (e.g. "AND") are simply dropped.
            warnings: ordered.length === 0 ? [`No airport matched "${query}".`] : [],
          },
        );
      },
    }),

    getAirportMetrics: tool({
      description:
        'Passenger, seat and flight (departure) totals, year-over-year growth, supply gap and load factor for 1 to 10 airports over the same 12 months, plus the monthly load factor. Use for follow-ups such as "how busy is X" or "compare growth".',
      inputSchema: z.object({ airports: codesSchema, endMonth: monthSchema.optional() }),
      execute: async ({ airports, endMonth }) => {
        const db = getDb();
        const codes = normalizeCodes(airports);
        const latest = await repo.latestTrafficMonth(db);
        const { end, warning } = chooseEnd([latest], endMonth);
        if (!end) throw new Error('Traffic data is not loaded yet.');
        const win = windowsEndingAt(end);
        const [rows, names, national, sources] = await Promise.all([
          repo.trafficRows(db, codes, win.w0[0] as string, end),
          repo.airportsByCodes(db, codes),
          repo.nationalTraffic(db, win.w1[0] as string, end),
          sourcesFor(db, ['bts-monthly-api']),
        ]);
        const warnings = [...(warning ? [warning] : []), ...foreignAirportWarnings(names, codes)];
        const rowsByAirport = byAirport(rows);
        const data = codes.map((code) => {
          const own = rowsByAirport.get(code) ?? [];
          const s = trafficSummary(own, win.w1, win.w0);
          if (s.passengersW1 == null || s.passengersW0 == null) warnings.push(`${code}: some months are missing in the window, so growth is unavailable.`);
          return {
            airport: code,
            name: nameOf(names, code),
            passengers12m: s.passengersW1,
            passengersPrior12m: s.passengersW0,
            seats12m: s.seatsW1,
            departures12m: s.departuresW1,
            passengerGrowthPct: pct(s.passengerGrowth),
            seatGrowthPct: pct(s.seatGrowth),
            flightGrowthPct: pct(s.flightGrowth),
            supplyGapPts: pts(s.supplyGap),
            loadFactorPct: pct(s.loadFactor),
            monthlyLoadFactorPct: monthlyLoadFactor(own, win.w1),
          };
        });
        return toolResult(
          {
            airports: data,
            nationalLoadFactorPct: pct(national.loadFactor),
            window: { recent: win.period, prior: { start: win.w0[0], end: win.w0.at(-1) } },
          },
          {
            period: win.period,
            sources,
            confidence: foreignAirportWarnings(names, codes).length ? 'low' : 'high',
            warnings,
            assumptions: [
              'Outbound traffic: passengers, seats and flights departing the airport.',
              'Passenger counts are segment passengers, not unique travelers.',
              'Flights are departures performed by all commercial services, cargo included.',
            ],
          },
        );
      },
    }),

    rankExpansionCandidates: tool({
      description:
        'Rank airports in a region (or a given list) with the deterministic expansion screening score (methodology screening-v1): demand growth, seat occupancy, delay pressure and supply gap on fixed ranges. Returns every component, the weights, and airports left out with the reason. Optional weights create a named scenario; give only the weights the user wants changed.',
      inputSchema: z.object({
        region: z.string().optional().describe('Region name or states, e.g. "New England", "Texas", "CA, OR"'),
        airports: z.array(z.string()).max(40).optional().describe('Explicit IATA codes instead of a region'),
        minPassengers: z.number().int().min(0).max(100_000_000).optional().describe('Eligibility threshold on outbound passengers in the recent 12 months; default 100,000'),
        weights: z
          .object({
            growth: z.number().min(0).max(1).optional(),
            loadFactor: z.number().min(0).max(1).optional(),
            delay: z.number().min(0).max(1).optional(),
            supplyGap: z.number().min(0).max(1).optional(),
          })
          .optional()
          .describe('Override only the components the user asked to change, as fractions (0.1 = 10%). The rest are rescaled in their default proportions.'),
        endMonth: monthSchema.optional(),
      }),
      execute: async ({ region, airports, minPassengers, weights, endMonth }) => {
        const db = getDb();
        let codes: string[];
        let regionLabel: string | null = null;
        if (airports?.length) codes = normalizeCodes(airports);
        else if (region) {
          const r = resolveRegion(region);
          if (!r) throw new Error(`Unknown region "${region}". Use a region such as "New England", state names or 2-letter state codes.`);
          regionLabel = r.label;
          codes = (await repo.airportsInRegions(db, r.isoRegions)).map((a) => a.iata);
        } else throw new Error('Give a region or a list of airports.');
        if (codes.length === 0) throw new Error('No airports with scheduled service found for that selection.');

        const { win, warning } = await trafficAndDelayWindow(db, endMonth);
        const [traffic, delays, names, sources] = await Promise.all([
          repo.trafficRows(db, codes, win.w0[0] as string, win.end),
          repo.delayRows(db, codes, win.w1[0] as string, win.end),
          repo.airportsByCodes(db, codes),
          sourcesFor(db, ['bts-monthly-api', 'delay-causes-file', 'ourairports']),
        ]);

        const trafficByAirport = byAirport(traffic);
        const delaysByAirport = byAirport(delays);
        const candidates: Candidate[] = codes.map((code) => {
          const s = trafficSummary(trafficByAirport.get(code) ?? [], win.w1, win.w0);
          const d = delaysByAirport.get(code) ?? [];
          return {
            airport: code,
            passengersW1: s.passengersW1,
            passengerGrowth: s.passengerGrowth,
            supplyGap: s.supplyGap,
            loadFactor: s.loadFactor,
            delayRate: d.length ? congestion(toCoreDelayRows(d)).delayRate : null,
          };
        });

        const base = { ...SCREENING_V1, minPassengers: minPassengers ?? SCREENING_V1.minPassengers };
        const cfg = weights && Object.values(weights).some((w) => w !== undefined) ? scenarioWeights(base, weights as Partial<Record<ComponentKey, number>>, 'custom weights') : base;
        const ranking = rankCandidates(candidates, cfg);
        const passengersOf = new Map(candidates.map((c) => [c.airport, c.passengersW1]));

        const display = (key: ComponentKey, raw: number) => (key === 'supplyGap' ? { value: pts(raw), unit: 'pts' } : { value: pct(raw), unit: '%' });
        return toolResult(
          {
            region: regionLabel,
            methodology: cfg.version,
            scenario: cfg.scenario,
            weightsPct: Object.fromEntries(Object.entries(cfg.components).map(([k, c]) => [k, Math.round(c.weight * 1000) / 10])),
            ranges: Object.fromEntries(
              Object.entries(cfg.components).map(([k, c]) => {
                const lo = pct(c.low);
                const hi = pct(c.high);
                return [k, k === 'supplyGap' ? `${lo} to ${hi} pts` : `${lo}% to ${hi}%`];
              }),
            ),
            minPassengers: cfg.minPassengers,
            ranked: ranking.ranked.map((r, i) => ({
              rank: i + 1,
              airport: r.airport,
              name: nameOf(names, r.airport),
              score: r.score,
              passengers12m: passengersOf.get(r.airport) ?? null,
              components: r.components.map((c) => ({
                key: c.key,
                label: c.label,
                raw: display(c.key, c.raw),
                normalized: Math.round(c.normalized * 1000) / 1000,
                weightPct: Math.round(c.weight * 1000) / 10,
                points: Math.round(c.points * 10) / 10,
              })),
            })),
            notRanked: ranking.excluded.map((e) => ({
              airport: e.airport,
              name: nameOf(names, e.airport),
              status: e.status,
              reason: e.reason,
              passengers12m: passengersOf.get(e.airport) ?? null,
            })),
            counts: {
              checked: codes.length,
              ranked: ranking.ranked.length,
              belowPassengerThreshold: ranking.excluded.filter((e) => e.status === 'ineligible').length,
              missingData: ranking.excluded.filter((e) => e.status === 'not_scored').length,
            },
          },
          {
            period: win.period,
            sources,
            confidence: 'medium',
            warnings: [...(warning ? [warning] : []), ...foreignAirportWarnings(names, codes)],
            assumptions: [
              'A screening score, not an ROI or a feasibility verdict: a high score means worth a terminal-capacity study.',
              'Fixed ranges and weights are illustrative and uncalibrated (see the methodology).',
              'Delay pressure uses arrivals delayed 15+ minutes by reporting carriers (domestic flights).',
              'The score ignores airport size, so each airport also shows its passengers over the 12 months; a higher passenger threshold focuses on larger airports.',
              'Seat occupancy (load factor) measures how full the planes are, not terminal use.',
            ],
          },
        );
      },
    }),

    compareCongestion: tool({
      description:
        'Compare congestion for 2 to 6 airports over the same 12 months: share of arrivals delayed 15+ minutes, cancellations, the system (NAS) share of delay minutes, delay causes, volume, and documented constraints. Says which airport is higher on each metric.',
      inputSchema: z.object({ airports: z.array(z.string()).min(2).max(6), endMonth: monthSchema.optional() }),
      execute: async ({ airports, endMonth }) => {
        const db = getDb();
        const codes = normalizeCodes(airports);
        const { win, warning } = await trafficAndDelayWindow(db, endMonth);
        const [delays, traffic, names, constraints, sources] = await Promise.all([
          repo.delayRows(db, codes, win.w1[0] as string, win.end),
          repo.trafficRows(db, codes, win.w1[0] as string, win.end),
          repo.airportsByCodes(db, codes),
          repo.constraintsFor(db, codes),
          sourcesFor(db, ['delay-causes-file', 'bts-monthly-api']),
        ]);
        const warnings = warning ? [warning] : [];
        const raw: Record<string, ReturnType<typeof congestion>> = {};
        const delaysByAirport = byAirport(delays);
        const trafficByAirport = byAirport(traffic);
        const data = codes.map((code) => {
          const rows = toCoreDelayRows(delaysByAirport.get(code) ?? []);
          if (rows.length === 0) warnings.push(`${code}: no delay data in the window (it may not be served by reporting carriers).`);
          const c = congestion(rows);
          raw[code] = c;
          const causes = delayCauseShares(rows);
          // Null when any month is missing: a partial total would understate the airport's flights.
          const deps = sumWindow(trafficByAirport.get(code) ?? [], win.w1, 'departures');
          return {
            airport: code,
            name: nameOf(names, code),
            arrivals: Math.round(c.arrFlights),
            delayedArrivals: Math.round(c.delayed),
            delayRatePct: pct(c.delayRate),
            cancelRatePct: c.cancelRate == null ? null : Math.round(c.cancelRate * 10000) / 100,
            nasSharePct: pct(c.nasShare),
            delayCausesPct: {
              carrier: pct(causes.carrier),
              lateAircraft: pct(causes.lateAircraft),
              nas: pct(causes.nas),
              weather: pct(causes.weather),
              security: pct(causes.security),
            },
            departures12m: deps,
          };
        });
        const higher = higherPerMetric(
          data.map((d) => ({ airport: d.airport, values: { delayRatePct: d.delayRatePct, cancelRatePct: d.cancelRatePct, nasSharePct: d.nasSharePct } })),
          ['delayRatePct', 'cancelRatePct', 'nasSharePct'],
        );
        // For a pair, the gaps in percentage points (first airport minus second), so the model never subtracts.
        const [a, b] = codes;
        const gap = (x: number | null | undefined, y: number | null | undefined, digits: number) =>
          x == null || y == null ? null : Math.round((x - y) * 100 * 10 ** digits) / 10 ** digits;
        const difference =
          codes.length === 2 && a && b && raw[a] && raw[b]
            ? {
                between: `${a} minus ${b}`,
                delayRatePts: gap(raw[a].delayRate, raw[b].delayRate, 1),
                cancelRatePts: gap(raw[a].cancelRate, raw[b].cancelRate, 2),
                nasSharePts: gap(raw[a].nasShare, raw[b].nasShare, 1),
              }
            : null;
        return toolResult(
          {
            airports: data,
            higherOn: higher,
            difference,
            constraints: constraints.map((c) => ({ airport: c.airport, kind: c.kind, summary: c.summary, sourceUrl: c.sourceUrl, asOf: c.asOf })),
          },
          {
            period: win.period,
            sources: [...sources, ...constraintSources(constraints)],
            confidence: 'high',
            warnings,
            assumptions: [
              'A delayed arrival is one arriving 15 or more minutes late (the BTS definition).',
              'Delay data covers flights by reporting carriers, mostly domestic.',
              'NAS share is the part of delay minutes the system attributes to airspace, traffic volume and airport operations: a proxy for airport congestion, not a direct measure.',
              'More flights does not by itself mean more congestion.',
            ],
          },
        );
      },
    }),

    getLongHaulShare: tool({
      description:
        'Share of departures from one airport flying at least a distance threshold, counted by flights performed (not routes), over the latest 12 months of route data. Returns both scopes (all services including cargo, and scheduled passenger only), distance bands and the top long-haul destinations. Call again with a new threshold or scope when the user changes them.',
      inputSchema: z.object({
        airport: z.string().describe('IATA code, e.g. "ANC"'),
        thresholdKm: z.number().min(500).max(15_000).optional().describe('Long-haul threshold in km; default 4,000'),
        scope: z.enum(['all', 'passenger']).optional().describe('all = every commercial service including cargo; passenger = scheduled passenger only. Default all.'),
        endMonth: monthSchema.optional(),
      }),
      execute: async ({ airport, thresholdKm, scope, endMonth }) => {
        const db = getDb();
        const [code] = normalizeCodes([airport]) as [string];
        const threshold = thresholdKm ?? 4000;
        const chosenScope = scope ?? 'all';
        const latest = await repo.latestSegmentMonth(db, code);
        const { end, warning } = chooseEnd([latest], endMonth);
        if (!end) throw new Error(`No route data for ${code}.`);
        const win = windowsEndingAt(end);
        const rows = await repo.segmentsFrom(db, code, win.w1[0] as string, end);
        const segments = rows.map((r) => ({ dest: r.dest, distanceMi: r.distanceMi, departures: r.departures, seats: r.seats, serviceClass: r.serviceClass }));
        const all = longHaulShare(segments, { thresholdKm: threshold, scope: 'all' });
        const passenger = longHaulShare(segments, { thresholdKm: threshold, scope: 'passenger' });
        const chosen = chosenScope === 'all' ? all : passenger;
        const scoped = chosenScope === 'all' ? segments : segments.filter(isPassengerService);
        const destCodes = chosen.topLongHaulDestinations.map((d) => d.dest);
        const [names, sources] = await Promise.all([repo.airportsByCodes(db, [code, ...destCodes]), sourcesFor(db, ['t100-segment-file', 'ourairports'])]);
        return toolResult(
          {
            airport: code,
            name: nameOf(names, code),
            thresholdKm: threshold,
            thresholdMi: chosen.thresholdMi,
            scope: chosenScope,
            longHaulSharePct: pct(chosen.share),
            longHaulDepartures: chosen.longHaulDepartures,
            departuresWithDistance: chosen.knownDistanceDepartures,
            departuresMissingDistance: chosen.unknownDistanceDepartures,
            bothScopes: { allServicesPct: pct(all.share), passengerOnlyPct: pct(passenger.share) },
            bands: distanceBands(scoped, threshold).map((b) => ({ label: b.label, departures: b.departures, sharePct: pct(b.share) })),
            topLongHaulDestinations: chosen.topLongHaulDestinations.map((d) => ({
              code: d.dest,
              name: nameOf(names, d.dest),
              country: rows.find((r) => r.dest === d.dest)?.destCountry ?? null,
              departures: d.departures,
              distanceKm: d.distanceKm,
            })),
          },
          {
            period: win.period,
            sources,
            confidence: foreignAirportWarnings(names, [code]).length ? 'low' : chosen.unknownDistanceDepartures > 0 ? 'medium' : 'high',
            warnings: [...(warning ? [warning] : []), ...foreignAirportWarnings(names, [code]), ...chosen.warnings],
            assumptions: [
              `Long-haul means ${threshold.toLocaleString('en-US')} km (${chosen.thresholdMi.toLocaleString('en-US')} statute miles) or more: a project definition, not an industry standard.`,
              'Counts departures performed, not routes or destinations.',
              'All services include cargo and charter flights; passenger only means scheduled passenger service (T-100 class F with seats).',
              'T-100 covers commercial carriers, not private or general aviation.',
            ],
          },
        );
      },
    }),

    assessDemandPressure: tool({
      description:
        'Assess demand pressure (the closest honest proxy for "unmet demand") at one airport: tests four signals (planes full, demand outpacing seats, operations strained, documented constraint) with their values, gives a pressure level, the monthly load factor, documented constraints, and what this data cannot show. Never turn this into a count of unmet flights.',
      inputSchema: z.object({ airport: z.string(), endMonth: monthSchema.optional() }),
      execute: async ({ airport, endMonth }) => {
        const db = getDb();
        const [code] = normalizeCodes([airport]) as [string];
        const { win, warning } = await trafficAndDelayWindow(db, endMonth);
        const [traffic, delays, names, constraints, national, sources] = await Promise.all([
          repo.trafficRows(db, [code], win.w0[0] as string, win.end),
          repo.delayRows(db, [code], win.w1[0] as string, win.end),
          repo.airportsByCodes(db, [code]),
          repo.constraintsFor(db, [code]),
          repo.nationalTraffic(db, win.w1[0] as string, win.end),
          sourcesFor(db, ['bts-monthly-api', 'delay-causes-file']),
        ]);
        const s = trafficSummary(traffic, win.w1, win.w0);
        const coreDelays = toCoreDelayRows(delays);
        const c = coreDelays.length ? congestion(coreDelays) : null;
        const p = demandPressure({
          loadFactor: s.loadFactor,
          supplyGap: s.supplyGap,
          delayRate: c?.delayRate ?? null,
          nasShare: c?.nasShare ?? null,
          documentedConstraints: constraints.length,
          loadFactorBenchmark: national.loadFactor,
        });
        return toolResult(
          {
            airport: code,
            name: nameOf(names, code),
            level: p.level,
            signalsMet: p.metCount,
            signals: p.signals,
            metrics: {
              passengers12m: s.passengersW1,
              loadFactorPct: pct(s.loadFactor),
              nationalLoadFactorPct: pct(national.loadFactor),
              passengerGrowthPct: pct(s.passengerGrowth),
              seatGrowthPct: pct(s.seatGrowth),
              flightGrowthPct: pct(s.flightGrowth),
              supplyGapPts: pts(s.supplyGap),
              delayRatePct: pct(c?.delayRate),
              nasSharePct: pct(c?.nasShare),
            },
            monthlyLoadFactorPct: monthlyLoadFactor(traffic, win.w1),
            constraints: constraints.map((x) => ({ kind: x.kind, summary: x.summary, sourceUrl: x.sourceUrl, asOf: x.asOf })),
            cannotTell: [
              'How many travelers wanted to fly but could not book (no public data measures this).',
              'Terminal, gate or check-in capacity in use.',
              'Fares and full itineraries (would need the BTS Origin and Destination survey).',
            ],
          },
          {
            period: win.period,
            sources: [...sources, ...constraintSources(constraints)],
            confidence: foreignAirportWarnings(names, [code]).length ? 'low' : 'medium',
            warnings: [...(warning ? [warning] : []), ...foreignAirportWarnings(names, [code])],
            assumptions: [
              'Signals are proxies for demand pressure, not a measurement of unmet demand.',
              'Delay rate counts arrivals 15 or more minutes late (the BTS definition), by reporting carriers.',
              `Planes are full = load factor above the national load factor for the same 12 months (${national.airports.toLocaleString('en-US')} US airports in the BTS data).`,
              'Other thresholds: supply gap above 0; delay rate 25% or more, or NAS share above 40%.',
              'A documented constraint suggests a cause; it is not a measured effect.',
            ],
          },
        );
      },
    }),

    getLiveConditions: tool({
      description:
        'Current conditions for 1 to 6 airports: FAA ground stops, ground delay programs, delays and closures, plus the latest weather observation (METAR). For closures, validFrom and validTo are the NOTAM validity window and inForceNow says whether it applies now; the start and reopen fields have no year, so never date a closure from them. Use as context next to historical analysis; current conditions never explain a 12-month trend.',
      inputSchema: z.object({ airports: z.array(z.string()).min(1).max(6) }),
      execute: async ({ airports }) => {
        const db = getDb();
        const codes = normalizeCodes(airports);
        const rows = await repo.airportsByCodes(db, codes);
        const icaos = rows.map((r) => r.icao).filter((x): x is string => Boolean(x)).sort();
        const warnings: string[] = [];
        let faa: { value: FaaStatus; fetchedAt: string; stale: boolean } | null = null;
        let metars: { value: Metar[]; fetchedAt: string; stale: boolean } | null = null;
        try {
          faa = await cachedFetch(db, 'faa:status', 300, fetchFaaStatus);
          if (faa.stale) warnings.push(`FAA feed unavailable; showing the status cached at ${faa.fetchedAt}.`);
        } catch {
          warnings.push('FAA status is unavailable right now.');
        }
        try {
          metars = await cachedFetch(db, `metar:${icaos.join(',')}`, 600, () => fetchMetars(icaos));
          if (metars.stale) warnings.push(`Weather feed unavailable; showing observations cached at ${metars.fetchedAt}.`);
        } catch {
          warnings.push('Weather observations are unavailable right now.');
        }
        const data = codes.map((code) => {
          const icao = rows.find((r) => r.iata === code)?.icao ?? null;
          const now = new Date();
          const events = faa ? faa.value.events.filter((e) => e.airport === code).map((e) => ({ ...e, inForceNow: inForceAt(e, now) })) : null;
          return {
            airport: code,
            name: nameOf(rows, code),
            faaEvents: events,
            noActiveFaaEvents: events ? events.length === 0 : null,
            weather: metars && icao ? (metars.value.find((m) => m.icao === icao) ?? null) : null,
          };
        });
        const sources: SourceRef[] = [];
        if (faa) sources.push({ id: 'faa-nas-status', label: SOURCES['faa-nas-status'].label, kind: 'live-api', url: SOURCES['faa-nas-status'].url, retrievedAt: faa.fetchedAt });
        if (metars) sources.push({ id: 'noaa-metar', label: SOURCES['noaa-metar'].label, kind: 'live-api', url: SOURCES['noaa-metar'].url, retrievedAt: metars.fetchedAt });
        return toolResult(
          { airports: data, faaUpdateTime: faa?.value.updateTime ?? null },
          {
            period: null,
            sources,
            confidence: 'high',
            warnings,
            assumptions: [
              'Not appearing in the FAA feed does not prove there are no delays.',
              'An FAA event can apply to one kind of operation only; do not describe it as a full airport closure unless it says so.',
              "Closure dates come from the NOTAM's own validity window (UTC), because the feed's start and reopen times give no year.",
              'Current conditions are context; they do not explain a 12-month trend.',
            ],
          },
        );
      },
    }),
  };
}

export type ClearwayTools = ReturnType<typeof createTools>;
