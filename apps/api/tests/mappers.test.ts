import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readCsvFile, parseCsvText } from '../src/data/csv';
import { DELAY_REQUIRED, T100_REQUIRED, mapAirport, mapDelay, mapT100, pickAirports, type T100Row } from '../src/data/imports/mappers';
import { makeQueue } from '../src/data/imports/queue';
import { longHaulShare } from '@clearway/core';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function readAll(name: string) {
  const out = [];
  for await (const rec of readCsvFile(fixture(name))) out.push(rec);
  return out;
}

describe('T-100 Segment mapper (REAL rows from the 2025 export)', () => {
  it('has every column the importer needs', async () => {
    const [first] = await readAll('t100-2025-sample.csv');
    for (const c of T100_REQUIRED) expect(c in first!).toBe(true);
  });

  it('maps an ANC to ICN all-cargo row', async () => {
    const [cargo] = (await readAll('t100-2025-sample.csv')).map(mapT100);
    expect(cargo).toEqual({
      month: '2025-11-01',
      origin: 'ANC',
      dest: 'ICN',
      destCountry: 'KR',
      carrier: 'FX',
      aircraftType: '626',
      aircraftConfig: '2',
      serviceClass: 'G',
      distanceMi: 3799,
      departuresPerformed: 1,
      seats: 0,
      passengers: 0,
    });
  });

  it('feeds the core long-haul calculation: only the cargo flight to ICN is long-haul', async () => {
    const rows = (await readAll('t100-2025-sample.csv')).map(mapT100).filter((r): r is T100Row => r !== null);
    const segments = rows.map((r) => ({ dest: r.dest, distanceMi: r.distanceMi, departures: r.departuresPerformed, seats: r.seats, serviceClass: r.serviceClass }));
    expect(longHaulShare(segments).share).toBeCloseTo(1 / 3, 10);
    expect(longHaulShare(segments, { scope: 'passenger' }).share).toBe(0);
  });

  it('skips rows without a month, airports, carrier or departures', () => {
    expect(mapT100({ YEAR: '2025', MONTH: '13', ORIGIN: 'ANC', DEST: 'SEA', UNIQUE_CARRIER: 'AS', DEPARTURES_PERFORMED: '1' })).toBeNull();
    expect(mapT100({ YEAR: '2025', MONTH: '1', ORIGIN: 'ANC', DEST: '', UNIQUE_CARRIER: 'AS', DEPARTURES_PERFORMED: '1' })).toBeNull();
    expect(mapT100({ YEAR: '2025', MONTH: '1', ORIGIN: 'ANC', DEST: 'SEA', UNIQUE_CARRIER: 'AS', DEPARTURES_PERFORMED: '' })).toBeNull();
  });
});

describe('Delay Causes mapper (REAL rows)', () => {
  it('maps LAX and SNA rows and keeps fractional counts', async () => {
    const recs = await readAll('delay-causes-sample.csv');
    for (const c of DELAY_REQUIRED) expect(c in recs[0]!).toBe(true);
    const [lax, sna] = recs.map(mapDelay);
    expect(lax?.airport).toBe('LAX');
    expect(lax?.month).toBe('2026-08-01');
    expect(lax?.arrFlights).toBe(3480);
    expect(lax?.nasDelay).toBe(5806);
    expect(sna?.airport).toBe('SNA');
    expect(sna?.arrDel15).toBe(142);
  });
});

describe('OurAirports mapper (SYNTHETIC rows in the OurAirports format)', () => {
  const csv = [
    'id,ident,type,name,latitude_deg,longitude_deg,iso_country,iso_region,municipality,scheduled_service,icao_code,gps_code,iata_code',
    '1,PANC,large_airport,Ted Stevens Anchorage International Airport,61.17,-149.99,US,US-AK,Anchorage,yes,PANC,PANC,ANC',
    '2,XXOLD,closed,Old Field,0,0,US,US-AK,Nowhere,no,,,OLD',
    '3,K1A1,small_airport,Small Strip,0,0,US,US-MA,Town,no,,,ZZZ',
    '4,KZZZ,medium_airport,Real ZZZ Airport,0,0,US,US-MA,Town,yes,KZZZ,KZZZ,ZZZ',
  ].join('\n');
  const rows = [...parseCsvText(csv)].map(mapAirport).filter((r) => r !== null);

  it('takes the ICAO code from the source (ANC is PANC) and skips closed airports', () => {
    const anc = rows.find((r) => r.iata === 'ANC');
    expect(anc?.icao).toBe('PANC');
    expect(anc?.region).toBe('US-AK');
    expect(rows.some((r) => r.iata === 'OLD')).toBe(false);
  });

  it('keeps one airport per IATA code, preferring scheduled service', () => {
    const picked = pickAirports(rows);
    expect(picked.map((r) => r.iata)).toEqual(['ANC', 'ZZZ']);
    expect(picked.find((r) => r.iata === 'ZZZ')?.name).toBe('Real ZZZ Airport');
  });
});

describe('insert queue', () => {
  it('limits concurrency and surfaces the first failure', async () => {
    const q = makeQueue(2);
    let running = 0;
    let peak = 0;
    const job = (fail = false) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (fail) throw new Error('batch failed');
    };
    for (let i = 0; i < 5; i++) await q.add(job());
    await q.drain();
    expect(peak).toBe(2);

    const q2 = makeQueue(2);
    await q2.add(job(true));
    let message = '';
    try {
      await q2.drain();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('batch failed');
  });
});
