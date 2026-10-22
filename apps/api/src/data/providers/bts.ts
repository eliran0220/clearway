// BTS "T-100 Segment Summary by Origin Airport" (Socrata dataset r495-tyji), one row per origin airport per month.
// Outbound only: totals = domestic + outbound international. Inbound international is reported separately and not stored.

export const BTS_MONTHLY_URL = 'https://data.transportation.gov/resource/r495-tyji.json';
export const BTS_SOURCE_ID = 'bts-monthly-api';

const USER_AGENT = 'clearway/0.1 (airport investment screening demo)';

const SELECT = [
  'origin_airport_code',
  'reporting_month',
  'total_departures',
  'total_passengers',
  'total_seats',
  'domestic_departures',
  'domestic_passengers',
  'domestic_seats',
  'outbound_international', // departures
  'outbound_international_1', // passengers
  'outbound_international_seats',
  'total_freight_lbs',
] as const;

export type BtsRawRow = Partial<Record<(typeof SELECT)[number], string>>;

export interface AirportTrafficMonth {
  airport: string;
  month: string; // 'YYYY-MM'
  departures: number | null;
  passengers: number | null;
  seats: number | null;
  domDepartures: number | null;
  domPassengers: number | null;
  domSeats: number | null;
  intlOutDepartures: number | null;
  intlOutPassengers: number | null;
  intlOutSeats: number | null;
  freightLbs: number | null;
}

/** Missing or blank stays null (unavailable); it never becomes 0. */
export function parseNumber(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const parseInt0 = (v: string | undefined) => {
  const n = parseNumber(v);
  return n == null ? null : Math.round(n);
};

/**
 * Field names verified against the live API on 2026-10-22. The opaque international names were reconciled on SFO, April 2026:
 * departures 12,735 domestic + 3,018 outbound_international = 15,753 total;
 * passengers 1,563,451 + 583,559 outbound_international_1 = 2,147,010 total.
 */
export function mapBtsRow(r: BtsRawRow): AirportTrafficMonth | null {
  const airport = r.origin_airport_code?.trim().toUpperCase();
  const month = r.reporting_month?.slice(0, 7);
  if (!airport || !month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return {
    airport,
    month,
    departures: parseInt0(r.total_departures),
    passengers: parseInt0(r.total_passengers),
    seats: parseInt0(r.total_seats),
    domDepartures: parseInt0(r.domestic_departures),
    domPassengers: parseInt0(r.domestic_passengers),
    domSeats: parseInt0(r.domestic_seats),
    intlOutDepartures: parseInt0(r.outbound_international),
    intlOutPassengers: parseInt0(r.outbound_international_1),
    intlOutSeats: parseInt0(r.outbound_international_seats),
    freightLbs: parseNumber(r.total_freight_lbs),
  };
}

const AIRPORT_CODE = /^[A-Z0-9]{3}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** Builds the SoQL query. Inputs are validated, never concatenated raw from user text. */
export function buildBtsUrl(opts: { airports?: string[]; since?: string; limit: number; offset: number }): URL {
  const where: string[] = [];
  if (opts.airports?.length) {
    const codes = opts.airports.map((a) => a.trim().toUpperCase());
    const bad = codes.filter((c) => !AIRPORT_CODE.test(c));
    if (bad.length) throw new Error(`Invalid airport code(s): ${bad.join(', ')}`);
    where.push(`origin_airport_code in (${codes.map((c) => `'${c}'`).join(',')})`);
  }
  if (opts.since) {
    if (!MONTH.test(opts.since)) throw new Error(`since must be YYYY-MM, got "${opts.since}"`);
    where.push(`reporting_month >= '${opts.since}-01T00:00:00'`);
  }
  const url = new URL(BTS_MONTHLY_URL);
  url.searchParams.set('$select', SELECT.join(','));
  if (where.length) url.searchParams.set('$where', where.join(' AND '));
  url.searchParams.set('$order', 'origin_airport_code, reporting_month');
  url.searchParams.set('$limit', String(opts.limit));
  url.searchParams.set('$offset', String(opts.offset));
  return url;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Up to 3 attempts for network errors, 429 and 5xx. No retry for other 4xx. */
async function fetchWithRetry(fetchImpl: typeof fetch, url: URL, attempts = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if ((res.status === 429 || res.status >= 500) && i < attempts) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * i);
        continue;
      }
      return res;
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1000 * i);
    }
  }
}

/** Keeps the first row per airport and month; a second row for the same key is counted, never summed. */
export function dedupe(rows: AirportTrafficMonth[]): { rows: AirportTrafficMonth[]; duplicates: number } {
  const seen = new Map<string, AirportTrafficMonth>();
  let duplicates = 0;
  for (const r of rows) {
    const key = `${r.airport}|${r.month}`;
    if (seen.has(key)) duplicates++;
    else seen.set(key, r);
  }
  return { rows: [...seen.values()], duplicates };
}

export interface BtsFetchResult {
  rows: AirportTrafficMonth[];
  url: string;
  retrievedAt: string;
  pages: number;
  skipped: number; // rows without a usable airport code or month
}

/** Fetches all pages, ordered, until a short page. */
export async function fetchBtsTraffic(
  opts: { airports?: string[]; since?: string; pageSize?: number; fetchImpl?: typeof fetch } = {},
): Promise<BtsFetchResult> {
  const pageSize = opts.pageSize ?? 5000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const rows: AirportTrafficMonth[] = [];
  let pages = 0;
  let skipped = 0;
  for (let offset = 0; ; offset += pageSize) {
    const url = buildBtsUrl({ airports: opts.airports, since: opts.since, limit: pageSize, offset });
    const res = await fetchWithRetry(fetchImpl, url);
    if (!res.ok) throw new Error(`BTS API returned HTTP ${res.status} for ${url.toString()}`);
    const page = (await res.json()) as BtsRawRow[];
    pages++;
    for (const raw of page) {
      const row = mapBtsRow(raw);
      if (row) rows.push(row);
      else skipped++;
    }
    if (page.length < pageSize) break;
    if (pages > 500) throw new Error('BTS pagination did not finish after 500 pages');
  }
  return { rows, url: BTS_MONTHLY_URL, retrievedAt: new Date().toISOString(), pages, skipped };
}
