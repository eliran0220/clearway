// Deterministic metrics for the Airport Investment Intelligence Agent.
// Every number the agent reports comes from functions in this folder.
// Methodology version: screening-v1

export const KM_PER_MILE = 1.609344;

/** A month is written 'YYYY-MM'. */
export type Month = string;

export interface TrafficRow {
  month: Month;
  passengers: number | null;
  seats: number | null;
}

export interface SegmentRow {
  dest: string;
  distanceMi: number | null;
  departures: number;
  seats: number | null;
  serviceClass: string | null; // F, G, L, P, Q
}

export interface DelayRow {
  arrFlights: number;
  arrDel15: number;
  arrCancelled: number;
  carrierDelay: number;
  weatherDelay: number;
  nasDelay: number;
  securityDelay: number;
  lateAircraftDelay: number;
}

// ---------- months and windows ----------

export function shiftMonth(month: Month, delta: number): Month {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

/** The `length` months ending at `end`, oldest first. */
export function monthsEnding(end: Month, length: number): Month[] {
  return Array.from({ length }, (_, i) => shiftMonth(end, i - (length - 1)));
}

export interface AlignedWindows {
  end: Month;
  w1: Month[]; // recent 12 months
  w0: Month[]; // the 12 months before
  included: string[];
  excluded: { airport: string; reason: string }[];
}

/**
 * Picks the latest month every airport has reported, then the two 12-month windows ending there.
 * Airports missing any month in either window are excluded with a reason, never zero-filled.
 */
export function alignedWindows(
  monthsByAirport: Record<string, Month[]>,
  length = 12,
): AlignedWindows | null {
  const airports = Object.keys(monthsByAirport).sort();
  const latest = airports
    .map((a) => [...monthsByAirport[a]].sort().at(-1))
    .filter((m): m is Month => Boolean(m));
  if (latest.length === 0) return null;
  const end = latest.sort()[0]; // latest month all airports have reached
  const w1 = monthsEnding(end, length);
  const w0 = monthsEnding(shiftMonth(end, -length), length);
  const needed = [...w0, ...w1];
  const included: string[] = [];
  const excluded: { airport: string; reason: string }[] = [];
  for (const airport of airports) {
    const have = new Set(monthsByAirport[airport]);
    const missing = needed.filter((m) => !have.has(m));
    if (missing.length === 0) included.push(airport);
    else excluded.push({ airport, reason: `missing ${missing.length} month(s): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` });
  }
  return { end, w1, w0, included, excluded };
}

// ---------- growth and load factor ----------

/** current / baseline - 1. Returns null (unavailable) when the baseline is missing or zero. */
export function growth(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null || baseline <= 0) return null;
  return current / baseline - 1;
}

export function sumWindow(rows: TrafficRow[], window: Month[], field: 'passengers' | 'seats'): number | null {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  let total = 0;
  for (const m of window) {
    const v = byMonth.get(m)?.[field];
    if (v == null) return null; // incomplete window: unavailable, not partial
    total += v;
  }
  return total;
}

/** Seat-weighted occupancy: sum(passengers) / sum(seats). Never an average of percentages. */
export function loadFactor(rows: { passengers: number | null; seats: number | null }[]): number | null {
  let p = 0;
  let s = 0;
  for (const r of rows) {
    if (r.passengers == null || r.seats == null) return null;
    p += r.passengers;
    s += r.seats;
  }
  return s > 0 ? p / s : null;
}

export interface TrafficSummary {
  passengersW1: number | null;
  passengersW0: number | null;
  seatsW1: number | null;
  seatsW0: number | null;
  passengerGrowth: number | null;
  seatGrowth: number | null;
  supplyGap: number | null; // passengerGrowth - seatGrowth
  loadFactor: number | null; // over W1
}

export function trafficSummary(rows: TrafficRow[], w1: Month[], w0: Month[]): TrafficSummary {
  const passengersW1 = sumWindow(rows, w1, 'passengers');
  const passengersW0 = sumWindow(rows, w0, 'passengers');
  const seatsW1 = sumWindow(rows, w1, 'seats');
  const seatsW0 = sumWindow(rows, w0, 'seats');
  const passengerGrowth = growth(passengersW1, passengersW0);
  const seatGrowth = growth(seatsW1, seatsW0);
  const supplyGap = passengerGrowth != null && seatGrowth != null ? passengerGrowth - seatGrowth : null;
  const lf = passengersW1 != null && seatsW1 != null && seatsW1 > 0 ? passengersW1 / seatsW1 : null;
  return { passengersW1, passengersW0, seatsW1, seatsW0, passengerGrowth, seatGrowth, supplyGap, loadFactor: lf };
}

// ---------- congestion ----------

export interface CongestionSummary {
  arrFlights: number;
  delayed: number;
  cancelled: number;
  delayRate: number | null;
  cancelRate: number | null;
  totalDelayMinutes: number;
  nasShare: number | null; // share of delay minutes attributed to the National Aviation System
}

/** Rates are computed from summed counts across carriers and months, never averaged per carrier. */
export function congestion(rows: DelayRow[]): CongestionSummary {
  let arrFlights = 0, delayed = 0, cancelled = 0, nas = 0, minutes = 0;
  for (const r of rows) {
    arrFlights += r.arrFlights;
    delayed += r.arrDel15;
    cancelled += r.arrCancelled;
    nas += r.nasDelay;
    minutes += r.carrierDelay + r.weatherDelay + r.nasDelay + r.securityDelay + r.lateAircraftDelay;
  }
  return {
    arrFlights,
    delayed,
    cancelled,
    delayRate: arrFlights > 0 ? delayed / arrFlights : null,
    cancelRate: arrFlights > 0 ? cancelled / arrFlights : null,
    totalDelayMinutes: minutes,
    nasShare: minutes > 0 ? nas / minutes : null,
  };
}

// ---------- long-haul share ----------

export type HaulScope = 'all' | 'passenger';

export interface LongHaulResult {
  share: number | null; // over departures with a known distance
  thresholdKm: number;
  thresholdMi: number;
  scope: HaulScope;
  longHaulDepartures: number;
  knownDistanceDepartures: number;
  unknownDistanceDepartures: number;
  totalDepartures: number;
  topLongHaulDestinations: { dest: string; departures: number; distanceKm: number }[];
  warnings: string[];
}

/** Scheduled passenger service: T-100 class F with seats. Cargo (G, P) and charters (L) are excluded. */
export const isPassengerService = (s: Pick<SegmentRow, 'serviceClass' | 'seats'>) => s.serviceClass === 'F' && (s.seats ?? 0) > 0;

/** Flight-weighted: counts departures performed, not routes or destinations. Rule: distance >= threshold. */
export function longHaulShare(
  segments: SegmentRow[],
  opts: { thresholdKm?: number; scope?: HaulScope } = {},
): LongHaulResult {
  const thresholdKm = opts.thresholdKm ?? 4000;
  const scope = opts.scope ?? 'all';
  const inScope = scope === 'passenger' ? segments.filter(isPassengerService) : segments;

  let total = 0, known = 0, unknown = 0, longHaul = 0;
  const byDest = new Map<string, { departures: number; distanceKm: number }>();
  for (const s of inScope) {
    total += s.departures;
    if (s.distanceMi == null) {
      unknown += s.departures;
      continue;
    }
    known += s.departures;
    const km = s.distanceMi * KM_PER_MILE;
    if (km >= thresholdKm) {
      longHaul += s.departures;
      const d = byDest.get(s.dest) ?? { departures: 0, distanceKm: km };
      d.departures += s.departures;
      byDest.set(s.dest, d);
    }
  }

  const warnings: string[] = [];
  if (unknown > 0) warnings.push(`${unknown} departure(s) have no distance and are excluded from the denominator.`);
  if (total === 0) warnings.push('No departures in scope for this airport and period.');

  const topLongHaulDestinations = [...byDest.entries()]
    .map(([dest, v]) => ({ dest, departures: v.departures, distanceKm: Math.round(v.distanceKm) }))
    .sort((a, b) => b.departures - a.departures || a.dest.localeCompare(b.dest))
    .slice(0, 5);

  return {
    share: known > 0 ? longHaul / known : null,
    thresholdKm,
    thresholdMi: Math.round(thresholdKm / KM_PER_MILE),
    scope,
    longHaulDepartures: longHaul,
    knownDistanceDepartures: known,
    unknownDistanceDepartures: unknown,
    totalDepartures: total,
    topLongHaulDestinations,
    warnings,
  };
}
