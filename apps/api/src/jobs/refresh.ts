// Daily job: upserts the newest BTS monthly airport traffic into Postgres.
// BTS publishes monthly, so most runs change little; recent months are re-fetched to catch revisions.

import { eq, sql, max } from 'drizzle-orm';
import { airportTrafficMonthly, createDb, sourceFetches, type Db } from '@clearway/db';
import { shiftMonth } from '@clearway/core';
import { BTS_MONTHLY_URL, BTS_SOURCE_ID, dedupe, fetchBtsTraffic } from '../data/providers/bts';

/** First load: two 12-month windows plus a buffer. */
export const BACKFILL_FROM = '2023-01';
/** BTS may revise recent months, so each run re-fetches this many months before the latest stored one. */
export const REVISION_MONTHS = 3;
const BATCH = 1000;

export interface RefreshResult {
  status: 'ok' | 'empty';
  since: string;
  rows: number;
  airports: number;
  latestMonth: string | null;
  duplicatesSkipped: number;
  fetchId: number | null;
}

export async function refreshTraffic(opts: { db?: Db; since?: string } = {}): Promise<RefreshResult> {
  const db = opts.db ?? createDb();

  const [latestRow] = await db.select({ latest: max(airportTrafficMonthly.month) }).from(airportTrafficMonthly);
  const latestStored = latestRow?.latest ? latestRow.latest.slice(0, 7) : null;
  const since = opts.since ?? (latestStored ? shiftMonth(latestStored, -REVISION_MONTHS) : BACKFILL_FROM);

  let fetched;
  try {
    fetched = await fetchBtsTraffic({ since });
  } catch (err) {
    await db.insert(sourceFetches).values({
      sourceId: BTS_SOURCE_ID,
      urlOrFile: BTS_MONTHLY_URL,
      periodStart: `${since}-01`,
      status: 'error',
      note: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const { rows, duplicates } = dedupe(fetched.rows);
  if (rows.length === 0) {
    // Never overwrite good data with an empty response.
    await db.insert(sourceFetches).values({
      sourceId: BTS_SOURCE_ID,
      urlOrFile: fetched.url,
      retrievedAt: new Date(fetched.retrievedAt),
      periodStart: `${since}-01`,
      status: 'empty',
      rowCount: 0,
    });
    return { status: 'empty', since, rows: 0, airports: 0, latestMonth: latestStored, duplicatesSkipped: duplicates, fetchId: null };
  }

  const months = rows.map((r) => r.month).sort();
  const [fetchRow] = await db
    .insert(sourceFetches)
    .values({
      sourceId: BTS_SOURCE_ID,
      urlOrFile: fetched.url,
      retrievedAt: new Date(fetched.retrievedAt),
      periodStart: `${months[0]}-01`,
      periodEnd: `${months.at(-1)}-01`,
      // 'running' until every batch is stored, so a half-finished load never counts as the latest good fetch.
      status: 'running',
      rowCount: rows.length,
      note: duplicates ? `${duplicates} duplicate airport-month rows skipped` : null,
    })
    .returning({ id: sourceFetches.id });

  const values = rows.map((r) => ({
    airport: r.airport,
    month: `${r.month}-01`,
    departures: r.departures,
    passengers: r.passengers,
    seats: r.seats,
    domDepartures: r.domDepartures,
    domPassengers: r.domPassengers,
    domSeats: r.domSeats,
    intlOutDepartures: r.intlOutDepartures,
    intlOutPassengers: r.intlOutPassengers,
    intlOutSeats: r.intlOutSeats,
    freightLbs: r.freightLbs,
    fetchId: fetchRow?.id ?? null,
  }));

  try {
    await upsertBatches(db, values);
  } catch (err) {
    if (fetchRow) await db.update(sourceFetches).set({ status: 'error', note: err instanceof Error ? err.message : String(err) }).where(eq(sourceFetches.id, fetchRow.id));
    throw err;
  }
  if (fetchRow) await db.update(sourceFetches).set({ status: 'ok' }).where(eq(sourceFetches.id, fetchRow.id));

  return {
    status: 'ok',
    since,
    rows: values.length,
    airports: new Set(rows.map((r) => r.airport)).size,
    latestMonth: months.at(-1) ?? null,
    duplicatesSkipped: duplicates,
    fetchId: fetchRow?.id ?? null,
  };
}

async function upsertBatches(db: Db, values: (typeof airportTrafficMonthly.$inferInsert)[]) {
  for (let i = 0; i < values.length; i += BATCH) {
    await db
      .insert(airportTrafficMonthly)
      .values(values.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: [airportTrafficMonthly.airport, airportTrafficMonthly.month],
        set: {
          departures: sql`excluded.departures`,
          passengers: sql`excluded.passengers`,
          seats: sql`excluded.seats`,
          domDepartures: sql`excluded.dom_departures`,
          domPassengers: sql`excluded.dom_passengers`,
          domSeats: sql`excluded.dom_seats`,
          intlOutDepartures: sql`excluded.intl_out_departures`,
          intlOutPassengers: sql`excluded.intl_out_passengers`,
          intlOutSeats: sql`excluded.intl_out_seats`,
          freightLbs: sql`excluded.freight_lbs`,
          fetchId: sql`excluded.fetch_id`,
        },
      });
  }
}

/** Lambda entry point for the EventBridge schedule. */
export const handler = async (): Promise<RefreshResult> => {
  const result = await refreshTraffic();
  console.log(JSON.stringify({ job: 'refresh-traffic', ...result }));
  return result;
};
