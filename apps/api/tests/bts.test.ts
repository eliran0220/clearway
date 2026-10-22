import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBtsUrl, dedupe, fetchBtsTraffic, mapBtsRow, parseNumber, type BtsRawRow } from '../src/data/providers/bts';

// REAL rows returned by the BTS API (r495-tyji) on 2026-10-22, trimmed to the fields we read.
const real = JSON.parse(readFileSync(new URL('./fixtures/bts-sfo-2026-03-04.json', import.meta.url), 'utf8')) as BtsRawRow[];

describe('BTS monthly API mapping', () => {
  it('maps the real SFO April 2026 row', () => {
    const r = mapBtsRow(real[0]);
    expect(r?.airport).toBe('SFO');
    expect(r?.month).toBe('2026-04');
    expect(r?.passengers).toBe(2147010);
    expect(r?.seats).toBe(2669813);
    expect(r?.intlOutPassengers).toBe(583559);
  });

  it('reconciles totals as domestic + outbound international (the opaque field names are mapped correctly)', () => {
    for (const raw of real) {
      const r = mapBtsRow(raw)!;
      expect((r.domDepartures ?? 0) + (r.intlOutDepartures ?? 0)).toBe(r.departures);
      expect((r.domPassengers ?? 0) + (r.intlOutPassengers ?? 0)).toBe(r.passengers);
      expect((r.domSeats ?? 0) + (r.intlOutSeats ?? 0)).toBe(r.seats);
    }
  });

  it('keeps missing values as null, never 0', () => {
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(mapBtsRow({ origin_airport_code: 'BOS', reporting_month: '2026-01-01T00:00:00.000' })?.passengers).toBeNull();
  });

  it('skips rows without a usable airport or month', () => {
    expect(mapBtsRow({ reporting_month: '2026-01-01T00:00:00.000' })).toBeNull();
    expect(mapBtsRow({ origin_airport_code: 'BOS', reporting_month: 'bad' })).toBeNull();
  });
});

describe('BTS query building', () => {
  it('validates airport codes and months instead of passing raw text into SoQL', () => {
    expect(() => buildBtsUrl({ airports: ["SFO') OR (1=1"], limit: 10, offset: 0 })).toThrow(/Invalid airport/);
    expect(() => buildBtsUrl({ since: '2026-1', limit: 10, offset: 0 })).toThrow(/YYYY-MM/);
    const url = buildBtsUrl({ airports: ['sfo', 'lax'], since: '2025-05', limit: 10, offset: 20 });
    expect(url.searchParams.get('$where')).toBe("origin_airport_code in ('SFO','LAX') AND reporting_month >= '2025-05-01T00:00:00'");
    expect(url.searchParams.get('$offset')).toBe('20');
  });

  it('pages until a short page arrives', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: URL) => {
      calls.push(url.searchParams.get('$offset') ?? '');
      const body = url.searchParams.get('$offset') === '0' ? [real[0], real[1]] : [real[1]];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchBtsTraffic({ pageSize: 2, fetchImpl: fakeFetch });
    expect(calls).toEqual(['0', '2']);
    expect(result.rows).toHaveLength(3);
    expect(result.pages).toBe(2);
  });
});

describe('refresh dedupe', () => {
  it('keeps one row per airport and month and counts the rest', () => {
    const a = mapBtsRow(real[0])!;
    const { rows, duplicates } = dedupe([a, { ...a, passengers: 1 }, mapBtsRow(real[1])!]);
    expect(rows).toHaveLength(2);
    expect(duplicates).toBe(1);
    expect(rows[0]?.passengers).toBe(2147010);
  });
});
