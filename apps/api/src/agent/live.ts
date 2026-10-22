// Live context: FAA NAS airport status and NOAA METAR, fetched and cached in Postgres
// (Lambda memory does not survive between invocations). Optional by design: a failure here
// never breaks a core answer.
import { eq, sql } from 'drizzle-orm';
import { liveCache, type Db } from '@clearway/db';
import { mapMetar, parseFaaStatus, type FaaStatus, type Metar } from './feeds';

export type { FaaEvent, FaaStatus, Metar } from './feeds';

export const FAA_STATUS_URL = 'https://nasstatus.faa.gov/api/airport-status-information';
export const METAR_URL = 'https://aviationweather.gov/api/data/metar';
const USER_AGENT = 'clearway/0.1 (airport investment screening demo)';

export interface Cached<T> {
  value: T;
  fetchedAt: string;
  stale: boolean; // true when the live fetch failed and an older cached value is used
}

/** Returns a fresh cached value, or fetches and stores it. On failure, falls back to the last cached value, labeled stale. */
export async function cachedFetch<T>(db: Db, key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<Cached<T>> {
  const [row] = await db.select().from(liveCache).where(eq(liveCache.key, key));
  if (row && row.expiresAt.getTime() > Date.now()) {
    return { value: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), stale: false };
  }
  try {
    const value = await fetcher();
    const now = new Date();
    await db
      .insert(liveCache)
      .values({ key, payload: value as object, fetchedAt: now, expiresAt: new Date(now.getTime() + ttlSeconds * 1000) })
      .onConflictDoUpdate({
        target: liveCache.key,
        set: { payload: sql`excluded.payload`, fetchedAt: sql`excluded.fetched_at`, expiresAt: sql`excluded.expires_at` },
      });
    return { value, fetchedAt: now.toISOString(), stale: false };
  } catch (err) {
    if (row) return { value: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), stale: true };
    throw err;
  }
}

export async function fetchFaaStatus(): Promise<FaaStatus> {
  const res = await fetch(FAA_STATUS_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`FAA status returned HTTP ${res.status}`);
  return parseFaaStatus(await res.text());
}

export async function fetchMetars(icaoCodes: string[]): Promise<Metar[]> {
  if (icaoCodes.length === 0) return [];
  const url = new URL(METAR_URL);
  url.searchParams.set('ids', icaoCodes.join(','));
  url.searchParams.set('format', 'json');
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`NOAA METAR returned HTTP ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows.map(mapMetar).filter((m): m is Metar => m !== null);
}
