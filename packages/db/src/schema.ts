import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Months are stored as the first day of the month (date). Code passes 'YYYY-MM-01'.
// Raw-grain tables are kept separate; aggregate each to airport and month before joining.

/** Provenance for every API fetch and file import. */
export const sourceFetches = pgTable('source_fetches', {
  id: serial('id').primaryKey(),
  sourceId: text('source_id').notNull(), // 'bts-monthly-api', 't100-segment-file', 'delay-causes-file', 'ourairports'
  urlOrFile: text('url_or_file').notNull(),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
  periodStart: date('period_start', { mode: 'string' }),
  periodEnd: date('period_end', { mode: 'string' }),
  status: text('status').notNull(), // 'running' until stored, then 'ok' | 'empty' | 'error'
  rowCount: integer('row_count'),
  note: text('note'),
});

/** Reference data from OurAirports. */
export const airports = pgTable(
  'airports',
  {
    iata: text('iata').primaryKey(), // 'SFO'
    icao: text('icao'), // 'KSFO', 'PANC': never derived by prefixing K
    name: text('name').notNull(),
    city: text('city'),
    region: text('region'), // ISO region, 'US-MA'
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    airportType: text('airport_type'), // large_airport, medium_airport...
    scheduledService: boolean('scheduled_service').notNull().default(false),
  },
  (t) => [index('airports_region_idx').on(t.region)],
);

/** BTS T-100 Segment Summary by Origin Airport (API r495-tyji). Upserted by the daily job. Outbound only. */
export const airportTrafficMonthly = pgTable(
  'airport_traffic_monthly',
  {
    airport: text('airport').notNull(), // BTS origin_airport_code; not every code exists in OurAirports, so no FK
    month: date('month', { mode: 'string' }).notNull(),
    departures: integer('departures'),
    passengers: integer('passengers'),
    seats: integer('seats'),
    domDepartures: integer('dom_departures'),
    domPassengers: integer('dom_passengers'),
    domSeats: integer('dom_seats'),
    intlOutDepartures: integer('intl_out_departures'),
    intlOutPassengers: integer('intl_out_passengers'),
    intlOutSeats: integer('intl_out_seats'),
    freightLbs: doublePrecision('freight_lbs'),
    fetchId: integer('fetch_id').references(() => sourceFetches.id),
  },
  (t) => [primaryKey({ columns: [t.airport, t.month] })],
);

/** BTS T-100 Segment, All Carriers (file export). Natural grain kept: no route-only dedupe. */
export const routeSegmentsMonthly = pgTable(
  'route_segments_monthly',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    month: date('month', { mode: 'string' }).notNull(),
    origin: text('origin').notNull(),
    dest: text('dest').notNull(),
    destCountry: text('dest_country'),
    carrier: text('carrier').notNull(), // UNIQUE_CARRIER
    aircraftType: text('aircraft_type'),
    aircraftConfig: text('aircraft_config'),
    serviceClass: text('service_class'), // F, G, L, P
    distanceMi: integer('distance_mi'),
    departuresPerformed: integer('departures_performed').notNull(),
    seats: integer('seats'),
    passengers: integer('passengers'),
    importId: integer('import_id').references(() => sourceFetches.id),
  },
  (t) => [index('route_segments_origin_month_idx').on(t.origin, t.month)],
);

/** BTS Airline On-Time Delay Causes (file export). Counts can be fractional; minutes are totals. */
export const airportDelaysMonthly = pgTable(
  'airport_delays_monthly',
  {
    airport: text('airport').notNull(),
    carrier: text('carrier').notNull(),
    month: date('month', { mode: 'string' }).notNull(),
    arrFlights: doublePrecision('arr_flights'),
    arrDel15: doublePrecision('arr_del15'),
    arrCancelled: doublePrecision('arr_cancelled'),
    arrDiverted: doublePrecision('arr_diverted'),
    carrierDelay: doublePrecision('carrier_delay'),
    weatherDelay: doublePrecision('weather_delay'),
    nasDelay: doublePrecision('nas_delay'),
    securityDelay: doublePrecision('security_delay'),
    lateAircraftDelay: doublePrecision('late_aircraft_delay'),
    importId: integer('import_id').references(() => sourceFetches.id),
  },
  (t) => [primaryKey({ columns: [t.airport, t.carrier, t.month] })],
);

/** Hand-curated, sourced facts used for the "why" (caps, runway layout). */
export const airportConstraints = pgTable('airport_constraints', {
  id: serial('id').primaryKey(),
  airport: text('airport').notNull(),
  kind: text('kind').notNull(), // regulatory_cap, runway_layout...
  summary: text('summary').notNull(),
  sourceUrl: text('source_url').notNull(),
  asOf: date('as_of', { mode: 'string' }).notNull(),
});

/** Cache for live APIs (FAA, NOAA). Lambda memory is not durable between invocations. */
export const liveCache = pgTable('live_cache', {
  key: text('key').primaryKey(), // 'faa:status', 'metar:KLAX,KSNA'
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
