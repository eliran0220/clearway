// Read-only queries used by the agent tools. Simple, parameterized selects only:
// aggregation happens in @clearway/core so it is unit-tested and identical everywhere.
import { and, asc, between, desc, eq, ilike, inArray, max, or } from 'drizzle-orm';
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

export async function delayRows(db: Db, codes: string[], from: string, to: string) {
  if (codes.length === 0) return [];
  const rows = await db
    .select()
    .from(airportDelaysMonthly)
    .where(and(inArray(airportDelaysMonthly.airport, codes), between(airportDelaysMonthly.month, toDate(from), toDate(to))));
  return rows.map((r) => ({ ...r, month: toMonth(r.month) }));
}

export async function segmentsFrom(db: Db, origin: string, from: string, to: string) {
  return db
    .select({
      dest: routeSegmentsMonthly.dest,
      destCountry: routeSegmentsMonthly.destCountry,
      distanceMi: routeSegmentsMonthly.distanceMi,
      departures: routeSegmentsMonthly.departuresPerformed,
      seats: routeSegmentsMonthly.seats,
      passengers: routeSegmentsMonthly.passengers,
      serviceClass: routeSegmentsMonthly.serviceClass,
    })
    .from(routeSegmentsMonthly)
    .where(and(eq(routeSegmentsMonthly.origin, origin), between(routeSegmentsMonthly.month, toDate(from), toDate(to))));
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
