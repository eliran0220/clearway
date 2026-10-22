// Database writers for the official exports. Each import records a source_fetches row
// ('running', then 'ok' or 'error'), so the app can always say which file and period a number came from.
import { basename } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { airportConstraints, airportDelaysMonthly, airports, routeSegmentsMonthly, sourceFetches, type Db } from '@clearway/db';
import { parseCsvText, readCsvFile, requireColumns } from '../csv';
import {
  AIRPORTS_REQUIRED,
  DELAY_REQUIRED,
  T100_REQUIRED,
  mapAirport,
  mapDelay,
  mapT100,
  pickAirports,
  validateConstraints,
  type AirportRow,
  type DelayRow,
  type T100Row,
} from './mappers';
import { makeQueue } from './queue';

export const OURAIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const BATCH = 2000; // 12 columns x 2000 rows stays well under Postgres' 65,535 parameter limit
const CONCURRENCY = 4;

type Log = (msg: string) => void;

async function startFetch(db: Db, sourceId: string, file: string, months: string[], rowCount: number, note?: string) {
  const [row] = await db
    .insert(sourceFetches)
    .values({
      sourceId,
      urlOrFile: file,
      periodStart: months[0] ?? null,
      periodEnd: months.at(-1) ?? null,
      status: 'running',
      rowCount,
      note: note ?? null,
    })
    .returning({ id: sourceFetches.id });
  if (!row) throw new Error('Could not record the import in source_fetches');
  return row.id;
}

async function finishFetch(db: Db, id: number, status: 'ok' | 'error', note?: string) {
  await db
    .update(sourceFetches)
    .set({ status, ...(note ? { note } : {}) })
    .where(eq(sourceFetches.id, id));
}

// ---------- T-100 Segment ----------

export interface T100Summary {
  files: { file: string; rows: number; skipped: number; firstMonth: string; lastMonth: string }[];
  monthsReplaced: number;
  rowsInserted: number;
}

/**
 * Two passes per file: scan (validate columns, count rows, find months), then insert.
 * Months present in the files are replaced as a whole, so re-importing the same export does not duplicate rows.
 */
export async function importT100(db: Db, files: string[], log: Log = console.log): Promise<T100Summary> {
  if (files.length === 0) throw new Error('Pass one or more T_T100_SEGMENT_ALL_CARRIER.csv files');

  const scans: { file: string; rows: number; skipped: number; months: string[] }[] = [];
  const allMonths = new Set<string>();
  for (const file of files) {
    let rows = 0;
    let skipped = 0;
    let checked = false;
    const months = new Set<string>();
    for await (const rec of readCsvFile(file)) {
      if (!checked) {
        requireColumns(rec, T100_REQUIRED, basename(file));
        checked = true;
      }
      const row = mapT100(rec);
      if (!row) {
        skipped++;
        continue;
      }
      rows++;
      months.add(row.month);
      allMonths.add(row.month);
    }
    scans.push({ file, rows, skipped, months: [...months].sort() });
    log(`Scanned ${basename(file)}: ${rows.toLocaleString('en-US')} rows, ${months.size} months, ${skipped} skipped`);
  }
  if (allMonths.size === 0) throw new Error('No usable T-100 rows found');

  const monthList = [...allMonths].sort();
  await db.delete(routeSegmentsMonthly).where(inArray(routeSegmentsMonthly.month, monthList));
  log(`Cleared ${monthList.length} months (${monthList[0]} to ${monthList.at(-1)}) before inserting`);

  let inserted = 0;
  for (const scan of scans) {
    const fetchId = await startFetch(db, 't100-segment-file', basename(scan.file), scan.months, scan.rows, scan.skipped ? `${scan.skipped} rows skipped` : undefined);
    const queue = makeQueue(CONCURRENCY);
    let batch: (T100Row & { importId: number })[] = [];
    let nextLog = inserted + 100_000;
    const flush = async () => {
      if (batch.length === 0) return;
      const values = batch;
      batch = [];
      await queue.add(() => db.insert(routeSegmentsMonthly).values(values));
      inserted += values.length;
      if (inserted >= nextLog) {
        log(`  inserted ${inserted.toLocaleString('en-US')} rows`);
        nextLog += 100_000;
      }
    };
    try {
      for await (const rec of readCsvFile(scan.file)) {
        const row = mapT100(rec);
        if (!row) continue;
        batch.push({ ...row, importId: fetchId });
        if (batch.length >= BATCH) await flush();
      }
      await flush();
      await queue.drain();
      await finishFetch(db, fetchId, 'ok');
    } catch (err) {
      await finishFetch(db, fetchId, 'error', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  return {
    files: scans.map((s) => ({ file: basename(s.file), rows: s.rows, skipped: s.skipped, firstMonth: s.months[0] ?? '', lastMonth: s.months.at(-1) ?? '' })),
    monthsReplaced: monthList.length,
    rowsInserted: inserted,
  };
}

// ---------- Delay Causes ----------

export interface DelaySummary {
  file: string;
  rows: number;
  skipped: number;
  duplicates: number;
  firstMonth: string;
  lastMonth: string;
}

/** Upserts by airport, carrier and month, so re-importing is safe. */
export async function importDelays(db: Db, file: string, log: Log = console.log): Promise<DelaySummary> {
  const byKey = new Map<string, DelayRow>();
  let skipped = 0;
  let duplicates = 0;
  let checked = false;
  for await (const rec of readCsvFile(file)) {
    if (!checked) {
      requireColumns(rec, DELAY_REQUIRED, basename(file));
      checked = true;
    }
    const row = mapDelay(rec);
    if (!row) {
      skipped++;
      continue;
    }
    const key = `${row.airport}|${row.carrier}|${row.month}`;
    if (byKey.has(key)) duplicates++;
    else byKey.set(key, row);
  }
  const rows = [...byKey.values()];
  if (rows.length === 0) throw new Error('No usable delay rows found');
  const months = [...new Set(rows.map((r) => r.month))].sort();
  log(`Scanned ${basename(file)}: ${rows.length.toLocaleString('en-US')} rows, ${months.length} months`);

  const fetchId = await startFetch(db, 'delay-causes-file', basename(file), months, rows.length, duplicates ? `${duplicates} duplicate rows skipped` : undefined);
  try {
    const queue = makeQueue(CONCURRENCY);
    for (let i = 0; i < rows.length; i += BATCH) {
      const values = rows.slice(i, i + BATCH).map((r) => ({ ...r, importId: fetchId }));
      await queue.add(() =>
        db
          .insert(airportDelaysMonthly)
          .values(values)
          .onConflictDoUpdate({
            target: [airportDelaysMonthly.airport, airportDelaysMonthly.carrier, airportDelaysMonthly.month],
            set: {
              arrFlights: sql`excluded.arr_flights`,
              arrDel15: sql`excluded.arr_del15`,
              arrCancelled: sql`excluded.arr_cancelled`,
              arrDiverted: sql`excluded.arr_diverted`,
              carrierDelay: sql`excluded.carrier_delay`,
              weatherDelay: sql`excluded.weather_delay`,
              nasDelay: sql`excluded.nas_delay`,
              securityDelay: sql`excluded.security_delay`,
              lateAircraftDelay: sql`excluded.late_aircraft_delay`,
              importId: sql`excluded.import_id`,
            },
          }),
      );
    }
    await queue.drain();
    await finishFetch(db, fetchId, 'ok');
  } catch (err) {
    await finishFetch(db, fetchId, 'error', err instanceof Error ? err.message : String(err));
    throw err;
  }
  return { file: basename(file), rows: rows.length, skipped, duplicates, firstMonth: months[0] ?? '', lastMonth: months.at(-1) ?? '' };
}

// ---------- Curated constraints ----------

/** Replaces all curated constraints with the reviewed file. */
export async function importConstraints(db: Db, file: string, log: Log = console.log) {
  const { readFile } = await import('node:fs/promises');
  const rows = validateConstraints(JSON.parse(await readFile(file, 'utf8')));
  const fetchId = await startFetch(db, 'curated-constraints', basename(file), [], rows.length);
  try {
    await db.delete(airportConstraints);
    if (rows.length) await db.insert(airportConstraints).values(rows);
    await finishFetch(db, fetchId, 'ok');
  } catch (err) {
    await finishFetch(db, fetchId, 'error', err instanceof Error ? err.message : String(err));
    throw err;
  }
  log(`Constraints: ${rows.length} entries for ${new Set(rows.map((r) => r.airport)).size} airports`);
  return { file: basename(file), entries: rows.length };
}

// ---------- OurAirports ----------

export interface AirportsSummary {
  source: string;
  withIata: number;
  stored: number;
}

/** Loads airports with an IATA code from OurAirports (or a local copy of airports.csv). */
export async function importAirports(db: Db, opts: { file?: string; log?: Log } = {}): Promise<AirportsSummary> {
  const log = opts.log ?? console.log;
  const source = opts.file ?? OURAIRPORTS_URL;
  let text: string;
  if (opts.file) {
    const { readFile } = await import('node:fs/promises');
    text = await readFile(opts.file, 'utf8');
  } else {
    const res = await fetch(OURAIRPORTS_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`OurAirports returned HTTP ${res.status}`);
    text = await res.text();
  }

  const mapped: AirportRow[] = [];
  let checked = false;
  for (const rec of parseCsvText(text)) {
    if (!checked) {
      requireColumns(rec, AIRPORTS_REQUIRED, 'airports.csv');
      checked = true;
    }
    const row = mapAirport(rec);
    if (row) mapped.push(row);
  }
  const rows = pickAirports(mapped);
  log(`OurAirports: ${mapped.length.toLocaleString('en-US')} rows with an IATA code, ${rows.length.toLocaleString('en-US')} unique codes`);

  const fetchId = await startFetch(db, 'ourairports', source, [], rows.length);
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      await db
        .insert(airports)
        .values(rows.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: airports.iata,
          set: {
            icao: sql`excluded.icao`,
            name: sql`excluded.name`,
            city: sql`excluded.city`,
            region: sql`excluded.region`,
            lat: sql`excluded.lat`,
            lon: sql`excluded.lon`,
            airportType: sql`excluded.airport_type`,
            scheduledService: sql`excluded.scheduled_service`,
          },
        });
    }
    await finishFetch(db, fetchId, 'ok');
  } catch (err) {
    await finishFetch(db, fetchId, 'error', err instanceof Error ? err.message : String(err));
    throw err;
  }
  return { source, withIata: mapped.length, stored: rows.length };
}
