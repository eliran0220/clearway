// Pure helpers used by the agent tools: resolution, windows, bands and comparisons. No I/O.
import { KM_PER_MILE, monthsEnding, shiftMonth, type DelayRow, type SegmentRow } from '@clearway/core';

export const AIRPORT_CODE = /^[A-Z0-9]{3}$/;

/** Upper-cases, de-duplicates and validates airport codes. */
export function normalizeCodes(codes: string[]): string[] {
  const out = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const bad = out.filter((c) => !AIRPORT_CODE.test(c));
  if (bad.length) throw new Error(`Not airport codes: ${bad.join(', ')}. Use 3-letter IATA codes such as SFO.`);
  return out;
}

// ---------- regions ----------

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const STATE_CODES = new Set(Object.values(STATES));

const NAMED_REGIONS: Record<string, { label: string; states: string[] }> = {
  'new england': { label: 'New England', states: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] },
  'mid-atlantic': { label: 'Mid-Atlantic', states: ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC'] },
  'west coast': { label: 'West Coast', states: ['CA', 'OR', 'WA'] },
  'pacific northwest': { label: 'Pacific Northwest', states: ['OR', 'WA', 'ID'] },
  southwest: { label: 'Southwest', states: ['AZ', 'NM', 'NV', 'UT'] },
  southeast: { label: 'Southeast', states: ['FL', 'GA', 'AL', 'SC', 'NC', 'TN', 'MS'] },
  midwest: { label: 'Midwest', states: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'] },
};

export interface Region {
  label: string;
  states: string[];
  isoRegions: string[]; // OurAirports format, 'US-MA'
}

/** Accepts a named region ("New England"), state names ("Texas") or state codes ("CA, OR"). */
export function resolveRegion(input: string): Region | null {
  const text = input.trim().toLowerCase();
  const named = NAMED_REGIONS[text];
  if (named) return { ...named, isoRegions: named.states.map((s) => `US-${s}`) };
  const parts = text.split(/\s*(?:,|\band\b|\/)\s*/).filter(Boolean);
  const states: string[] = [];
  for (const p of parts) {
    const code = STATES[p] ?? (STATE_CODES.has(p.toUpperCase()) ? p.toUpperCase() : null);
    if (!code) return null;
    states.push(code);
  }
  if (states.length === 0) return null;
  const unique = [...new Set(states)];
  return { label: unique.join(', '), states: unique, isoRegions: unique.map((s) => `US-${s}`) };
}

// ---------- city aliases ----------

export interface AliasMatch {
  codes: string[];
  assumptions: string[];
}

const ALIASES: { pattern: RegExp; codes: string[]; assumption?: string }[] = [
  { pattern: /\b(santa ana|john wayne|orange county)\b/i, codes: ['SNA'] },
  { pattern: /\b(la|l\.a\.|los angeles)\b/i, codes: ['LAX'], assumption: 'Took "LA" to mean LAX. Burbank (BUR), Long Beach (LGB), Ontario (ONT) and Santa Ana (SNA) also serve the area.' },
  { pattern: /\bsan francisco\b/i, codes: ['SFO'], assumption: 'Took San Francisco to mean SFO. Oakland (OAK) and San Jose (SJC) are separate airports.' },
  { pattern: /\banchorage\b/i, codes: ['ANC'] },
  { pattern: /\b(new york|nyc)\b/i, codes: ['JFK', 'LGA', 'EWR'], assumption: 'New York has three major airports: JFK, LaGuardia (LGA) and Newark (EWR).' },
  { pattern: /\b(washington,? d\.?c\.?|washington dc)\b/i, codes: ['DCA', 'IAD', 'BWI'], assumption: 'Washington is served by Reagan National (DCA), Dulles (IAD) and Baltimore/Washington (BWI).' },
  { pattern: /\bchicago\b/i, codes: ['ORD', 'MDW'], assumption: "Chicago has two airports: O'Hare (ORD) and Midway (MDW)." },
  { pattern: /\bboston\b/i, codes: ['BOS'] },
];

/**
 * Every city alias mentioned in the text, in the order they appear ("LA and Santa Ana" -> LAX, SNA),
 * with the assumption said out loud when a city has several airports.
 */
export function matchAliases(text: string): AliasMatch {
  const hits: { index: number; codes: string[]; assumption?: string }[] = [];
  for (const a of ALIASES) {
    const m = a.pattern.exec(text);
    if (m) hits.push({ index: m.index, codes: a.codes, assumption: a.assumption });
  }
  hits.sort((x, y) => x.index - y.index);
  return {
    codes: [...new Set(hits.flatMap((h) => h.codes))],
    assumptions: hits.map((h) => h.assumption).filter((a): a is string => Boolean(a)),
  };
}

const TYPE_RANK: Record<string, number> = { large_airport: 3, medium_airport: 2, small_airport: 1 };

/** Largest airports first, then by code. */
export function rankBySize<T extends { iata: string; airportType: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (TYPE_RANK[b.airportType ?? ''] ?? 0) - (TYPE_RANK[a.airportType ?? ''] ?? 0) || a.iata.localeCompare(b.iata));
}

// ---------- windows ----------

export interface Windows {
  end: string;
  w1: string[]; // recent 12 months
  w0: string[]; // the 12 months before
  period: { start: string; end: string };
}

export function windowsEndingAt(end: string): Windows {
  const w1 = monthsEnding(end, 12);
  const w0 = monthsEnding(shiftMonth(end, -12), 12);
  return { end, w1, w0, period: { start: w1[0] as string, end } };
}

/**
 * The window ends at the latest month every source has. A requested end month later than that
 * is capped (with a warning); an earlier one is honored.
 */
export function chooseEnd(latestPerSource: (string | null)[], requested?: string): { end: string | null; warning?: string } {
  const known = latestPerSource.filter((m): m is string => Boolean(m)).sort();
  if (known.length === 0 || known.length < latestPerSource.length) return { end: null, warning: 'A required data source has no data loaded.' };
  const common = known[0] as string;
  if (!requested) return { end: common };
  if (!/^\d{4}-\d{2}$/.test(requested)) return { end: common, warning: `Ignored end month "${requested}"; expected YYYY-MM.` };
  if (requested > common) return { end: common, warning: `Data runs only to ${common}; used that instead of ${requested}.` };
  return { end: requested };
}

// ---------- distance bands ----------

export interface Band {
  label: string;
  departures: number;
  share: number | null;
}

/** Departures in three bands: under 1,500 km, 1,500 km to the threshold, and the threshold or more. Unknown distances are excluded. */
export function distanceBands(segments: SegmentRow[], thresholdKm: number): Band[] {
  const short = Math.min(1500, thresholdKm);
  const fmt = (km: number) => km.toLocaleString('en-US');
  let a = 0;
  let b = 0;
  let c = 0;
  for (const s of segments) {
    if (s.distanceMi == null) continue;
    const km = s.distanceMi * KM_PER_MILE;
    if (km >= thresholdKm) c += s.departures;
    else if (km >= short) b += s.departures;
    else a += s.departures;
  }
  const total = a + b + c;
  const share = (n: number) => (total > 0 ? n / total : null);
  const bands: Band[] = [{ label: `Under ${fmt(short)} km`, departures: a, share: share(a) }];
  if (thresholdKm > short) bands.push({ label: `${fmt(short)} to ${fmt(thresholdKm)} km`, departures: b, share: share(b) });
  bands.push({ label: `${fmt(thresholdKm)} km or more`, departures: c, share: share(c) });
  return bands;
}

// ---------- delays ----------

export interface DelayDbRow {
  arrFlights: number | null;
  arrDel15: number | null;
  arrCancelled: number | null;
  carrierDelay: number | null;
  weatherDelay: number | null;
  nasDelay: number | null;
  securityDelay: number | null;
  lateAircraftDelay: number | null;
}

/** Blank cells in the export count as zero inside a sum; an airport with no rows stays unavailable. */
export function toCoreDelayRows(rows: DelayDbRow[]): DelayRow[] {
  return rows.map((r) => ({
    arrFlights: r.arrFlights ?? 0,
    arrDel15: r.arrDel15 ?? 0,
    arrCancelled: r.arrCancelled ?? 0,
    carrierDelay: r.carrierDelay ?? 0,
    weatherDelay: r.weatherDelay ?? 0,
    nasDelay: r.nasDelay ?? 0,
    securityDelay: r.securityDelay ?? 0,
    lateAircraftDelay: r.lateAircraftDelay ?? 0,
  }));
}

/** Share of delay minutes by reported cause. */
export function delayCauseShares(rows: DelayRow[]) {
  const t = { carrier: 0, weather: 0, nas: 0, security: 0, lateAircraft: 0 };
  for (const r of rows) {
    t.carrier += r.carrierDelay;
    t.weather += r.weatherDelay;
    t.nas += r.nasDelay;
    t.security += r.securityDelay;
    t.lateAircraft += r.lateAircraftDelay;
  }
  const total = t.carrier + t.weather + t.nas + t.security + t.lateAircraft;
  const share = (n: number) => (total > 0 ? n / total : null);
  return { carrier: share(t.carrier), weather: share(t.weather), nas: share(t.nas), security: share(t.security), lateAircraft: share(t.lateAircraft) };
}

/** Which airport is higher on each metric, compared at one decimal of a percentage (closer is a tie). */
export function higherPerMetric(items: { airport: string; values: Record<string, number | null> }[], metrics: string[]) {
  const out: Record<string, string | 'tie' | null> = {};
  for (const m of metrics) {
    const vals = items.map((i) => ({ airport: i.airport, v: i.values[m] })).filter((x): x is { airport: string; v: number } => x.v != null);
    if (vals.length < 2) {
      out[m] = null;
      continue;
    }
    const rounded = vals.map((x) => ({ ...x, r: Math.round(x.v * 1000) }));
    const top = Math.max(...rounded.map((x) => x.r));
    const leaders = rounded.filter((x) => x.r === top);
    out[m] = leaders.length > 1 ? 'tie' : (leaders[0] as { airport: string }).airport;
  }
  return out;
}

export const round = (x: number | null, digits = 4) => (x == null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

/** Groups rows by airport code in one pass, so per-airport work is not a filter over every row. */
export function byAirport<T extends { airport: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const list = groups.get(r.airport);
    if (list) list.push(r);
    else groups.set(r.airport, [r]);
  }
  return groups;
}
