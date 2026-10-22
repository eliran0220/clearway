// Read-only queries used by the agent tools. Simple, parameterized selects: the metrics themselves
// (rates, shares, growth) are computed in @clearway/core so they are unit-tested and identical
// everywhere. SQL only pre-sums plain counts where the row volume would otherwise be large.
import { and, asc, between, desc, eq, ilike, inArray, like, max, or, sql } from 'drizzle-orm';
import {
  airportConstraints,
  airportDelaysMonthly,
  airportTrafficMonthly,
  airports,
  routeSegmentsMonthly,
  sourceFetches,
  type Db,
} from '@clearway/db';

/** 'YYYY-MM' -> 'YYYY-MM-01' for date columns. */
export const toDate = (month: string) => `${month}-01`;
/** 'YYYY-MM-DD' -> 'YYYY-MM'. */
export const toMonth = (date: string) => date.slice(0, 7);

export async function latestTrafficMonth(db: Db): Promise<string | null> {
  const [row] = await db.select({ m: max(airportTrafficMonthly.month) }).from(airportTrafficMonthly);
  return row?.m ? toMonth(row.m) : null;
}

export async function latestDelayMonth(db: Db): Promise<string | null> {
  const [row] = await db.select({ m: max(airportDelaysMonthly.month) }).from(airportDelaysMonthly);
  return row?.m ? toMonth(row.m) : null;
}

export async function latestSegmentMonth(db: Db, origin?: string): Promise<string | null> {
  const q = db.select({ m: max(routeSegmentsMonthly.month) }).from(routeSegmentsMonthly);
  const [row] = origin ? await q.where(eq(routeSegmentsMonthly.origin, origin)) : await q;
  return row?.m ? toMonth(row.m) : null;
}

export async function trafficRows(db: Db, codes: string[], from: string, to: string) {
  if (codes.length === 0) return [];
  const rows = await db
    .select({
      airport: airportTrafficMonthly.airport,
      month: airportTrafficMonthly.month,
      passengers: airportTrafficMonthly.passengers,
      seats: airportTrafficMonthly.seats,
      departures: airportTrafficMonthly.departures,
    })
    .from(airportTrafficMonthly)
    .where(and(inArray(airportTrafficMonthly.airport, codes), between(airportTrafficMonthly.month, toDate(from), toDate(to))))
    .orderBy(asc(airportTrafficMonthly.airport), asc(airportTrafficMonthly.month));
  return rows.map((r) => ({ ...r, month: toMonth(r.month) }));
}

/** Outbound passengers and seats summed over all US airports (OurAirports region US-*) for a period: the national benchmark. */
export async function nationalTraffic(db: Db, from: string, to: string) {
  const [row] = await db
    .select({
      passengers: sql<number>`coalesce(sum(${airportTrafficMonthly.passengers}), 0)::float8`,
      seats: sql<number>`coalesce(sum(${airportTrafficMonthly.seats}), 0)::float8`,
      airports: sql<number>`count(distinct ${airportTrafficMonthly.airport})::int`,
    })
    .from(airportTrafficMonthly)
    .innerJoin(airports, eq(airports.iata, airportTrafficMonthly.airport))
    .where(and(between(airportTrafficMonthly.month, toDate(from), toDate(to)), like(airports.region, 'US-%')));
  const passengers = Number(row?.passengers ?? 0);
  const seats = Number(row?.seats ?? 0);
  return { passengers, seats, airports: Number(row?.airports ?? 0), loadFactor: seats > 0 ? passengers / seats : null };
}

export async function delayRows(db: Db, codes: string[], from: string, to: string) {
  if (codes.length === 0) return [];
  const rows = await db
    .select()
    .from(airportDelaysMonthly)
    .where(and(inArray(airportDelaysMonthly.airport, codes), between(airportDelaysMonthly.month, toDate(from), toDate(to))));
  return rows.map((r) => ({ ...r, month: toMonth(r.month) }));
}

/**
 * Departures from one airport over a period, summed in SQL per destination, distance and service
 * class: a busy airport has tens of thousands of carrier x aircraft x month rows, and the long-haul
 * math only needs these totals. Grouping by "has seats" keeps the passenger-service test exact
 * (class F with seats on the row itself).
 */
export async function segmentsFrom(db: Db, origin: string, from: string, to: string) {
  const s = routeSegmentsMonthly;
  const rows = await db
    .select({
      dest: s.dest,
      destCountry: s.destCountry,
      distanceMi: s.distanceMi,
      serviceClass: s.serviceClass,
      departures: sql<number>`coalesce(sum(${s.departuresPerformed}), 0)::float8`,
      seats: sql<number | null>`sum(${s.seats})::float8`,
      passengers: sql<number | null>`sum(${s.passengers})::float8`,
    })
    .from(s)
    .where(and(eq(s.origin, origin), between(s.month, toDate(from), toDate(to))))
    .groupBy(s.dest, s.destCountry, s.distanceMi, s.serviceClass, sql`(${s.seats} > 0)`);
  return rows.map((r) => ({
    ...r,
    departures: Number(r.departures),
    seats: r.seats == null ? null : Number(r.seats),
    passengers: r.passengers == null ? null : Number(r.passengers),
  }));
}

export async function airportsByCodes(db: Db, codes: string[]) {
  if (codes.length === 0) return [];
  return db.select().from(airports).where(inArray(airports.iata, codes));
}

export async function airportsInRegions(db: Db, regions: string[]) {
  if (regions.length === 0) return [];
  return db
    .select()
    .from(airports)
    .where(and(inArray(airports.region, regions), eq(airports.scheduledService, true)))
    .orderBy(asc(airports.iata));
}

/** Name or city search among airports with scheduled service. Callers rank the matches by size. */
export async function searchAirports(db: Db, text: string, limit = 25) {
  const pattern = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db
    .select()
    .from(airports)
    .where(and(eq(airports.scheduledService, true), or(ilike(airports.name, pattern), ilike(airports.city, pattern))))
    .orderBy(asc(airports.iata))
    .limit(limit);
}

export async function constraintsFor(db: Db, codes: string[]) {
  if (codes.length === 0) return [];
  return db.select().from(airportConstraints).where(inArray(airportConstraints.airport, codes)).orderBy(asc(airportConstraints.airport));
}

/** Latest successful fetch or import per source, for the evidence footer. */
export async function latestFetches(db: Db, sourceIds: string[]) {
  if (sourceIds.length === 0) return [];
  return db
    .selectDistinctOn([sourceFetches.sourceId])
    .from(sourceFetches)
    .where(and(inArray(sourceFetches.sourceId, sourceIds), eq(sourceFetches.status, 'ok')))
    .orderBy(sourceFetches.sourceId, desc(sourceFetches.retrievedAt));
}
