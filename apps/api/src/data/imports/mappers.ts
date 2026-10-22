// Pure row mappers for the official exports. No database access here, so they are unit-testable.
import { int, num, type CsvRecord } from '../csv';

const monthKey = (year: number | null, month: number | null): string | null =>
  year && month && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}-01` : null;

// ---------- BTS T-100 Segment, All Carriers ----------

export const T100_REQUIRED = [
  'YEAR',
  'MONTH',
  'ORIGIN',
  'DEST',
  'DISTANCE',
  'DEPARTURES_PERFORMED',
  'SEATS',
  'PASSENGERS',
  'UNIQUE_CARRIER',
  'CLASS',
] as const;

export interface T100Row {
  month: string; // 'YYYY-MM-01'
  origin: string;
  dest: string;
  destCountry: string | null;
  carrier: string;
  aircraftType: string | null;
  aircraftConfig: string | null;
  serviceClass: string | null;
  distanceMi: number | null;
  departuresPerformed: number;
  seats: number | null;
  passengers: number | null;
}

export function mapT100(r: CsvRecord): T100Row | null {
  const month = monthKey(int(r.YEAR), int(r.MONTH));
  const origin = r.ORIGIN?.trim().toUpperCase();
  const dest = r.DEST?.trim().toUpperCase();
  const carrier = (r.UNIQUE_CARRIER || r.CARRIER || '').trim();
  const departures = int(r.DEPARTURES_PERFORMED);
  if (!month || !origin || !dest || !carrier || departures == null) return null;
  return {
    month,
    origin,
    dest,
    destCountry: r.DEST_COUNTRY?.trim() || null,
    carrier,
    aircraftType: r.AIRCRAFT_TYPE?.trim() || null,
    aircraftConfig: r.AIRCRAFT_CONFIG?.trim() || null,
    serviceClass: r.CLASS?.trim() || null,
    distanceMi: int(r.DISTANCE),
    departuresPerformed: departures,
    seats: int(r.SEATS),
    passengers: int(r.PASSENGERS),
  };
}

// ---------- BTS Airline On-Time Delay Causes ----------

export const DELAY_REQUIRED = [
  'year',
  'month',
  'carrier',
  'airport',
  'arr_flights',
  'arr_del15',
  'arr_cancelled',
  'arr_diverted',
  'carrier_delay',
  'weather_delay',
  'nas_delay',
  'security_delay',
  'late_aircraft_delay',
] as const;

export interface DelayRow {
  airport: string;
  carrier: string;
  month: string; // 'YYYY-MM-01'
  arrFlights: number | null;
  arrDel15: number | null;
  arrCancelled: number | null;
  arrDiverted: number | null;
  carrierDelay: number | null;
  weatherDelay: number | null;
  nasDelay: number | null;
  securityDelay: number | null;
  lateAircraftDelay: number | null;
}

/** Counts stay fractional: BTS allocates delay causes across categories. */
export function mapDelay(r: CsvRecord): DelayRow | null {
  const month = monthKey(int(r.year), int(r.month));
  const airport = r.airport?.trim().toUpperCase();
  const carrier = r.carrier?.trim();
  if (!month || !airport || !carrier) return null;
  return {
    airport,
    carrier,
    month,
    arrFlights: num(r.arr_flights),
    arrDel15: num(r.arr_del15),
    arrCancelled: num(r.arr_cancelled),
    arrDiverted: num(r.arr_diverted),
    carrierDelay: num(r.carrier_delay),
    weatherDelay: num(r.weather_delay),
    nasDelay: num(r.nas_delay),
    securityDelay: num(r.security_delay),
    lateAircraftDelay: num(r.late_aircraft_delay),
  };
}

// ---------- Curated constraints ----------

export interface ConstraintInput {
  airport: string;
  kind: string;
  summary: string;
  sourceUrl: string;
  asOf: string; // YYYY-MM-DD
}

/** Validates the curated constraints file; every fact needs a source URL and an as-of date. */
export function validateConstraints(raw: unknown): ConstraintInput[] {
  if (!Array.isArray(raw)) throw new Error('constraints.json must be an array');
  return raw.map((c, i) => {
    const x = c as Partial<ConstraintInput>;
    const ok =
      typeof x.airport === 'string' && /^[A-Z0-9]{3}$/.test(x.airport) &&
      typeof x.kind === 'string' && x.kind.length > 0 &&
      typeof x.summary === 'string' && x.summary.length > 0 &&
      typeof x.sourceUrl === 'string' && /^https:\/\//.test(x.sourceUrl) &&
      typeof x.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.asOf);
    if (!ok) throw new Error(`constraints.json entry ${i} needs airport (IATA), kind, summary, an https sourceUrl and asOf (YYYY-MM-DD)`);
    return x as ConstraintInput;
  });
}

// ---------- OurAirports ----------

export const AIRPORTS_REQUIRED = ['type', 'name', 'iso_region', 'iata_code', 'scheduled_service'] as const;

export interface AirportRow {
  iata: string;
  icao: string | null;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  airportType: string;
  scheduledService: boolean;
}

const TYPE_RANK: Record<string, number> = { large_airport: 5, medium_airport: 4, small_airport: 3, seaplane_base: 2, heliport: 1 };

export function mapAirport(r: CsvRecord): AirportRow | null {
  const iata = r.iata_code?.trim().toUpperCase();
  const type = r.type?.trim() ?? '';
  if (!iata || !/^[A-Z0-9]{3}$/.test(iata) || type === 'closed') return null;
  const ident = r.ident?.trim() ?? '';
  return {
    iata,
    // The ICAO code comes from the source, never from prefixing K (ANC is PANC).
    icao: r.icao_code?.trim() || r.gps_code?.trim() || (/^[A-Z]{4}$/.test(ident) ? ident : null),
    name: r.name?.trim() ?? iata,
    city: r.municipality?.trim() || null,
    region: r.iso_region?.trim() || null,
    lat: num(r.latitude_deg),
    lon: num(r.longitude_deg),
    airportType: type,
    scheduledService: r.scheduled_service?.trim() === 'yes',
  };
}

/** Several OurAirports rows can share an IATA code; keep the one with scheduled service, then the largest type. */
export function pickAirports(rows: AirportRow[]): AirportRow[] {
  const best = new Map<string, AirportRow>();
  const score = (a: AirportRow) => (a.scheduledService ? 10 : 0) + (TYPE_RANK[a.airportType] ?? 0);
  for (const a of rows) {
    const current = best.get(a.iata);
    if (!current || score(a) > score(current)) best.set(a.iata, a);
  }
  return [...best.values()].sort((x, y) => x.iata.localeCompare(y.iata));
}
