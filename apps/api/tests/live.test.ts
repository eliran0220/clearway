import { describe, it, expect } from 'vitest';
import { mapMetar, parseFaaStatus } from '../src/agent/feeds';
import { allowRequest } from '../src/rate-limit';
import { validateConstraints } from '../src/data/imports/mappers';
import { readFileSync } from 'node:fs';

// Built from the element names and values the live FAA feed returned on 2026-10-22 (format sample).
const FAA_XML = `<AIRPORT_STATUS_INFORMATION><Update_Time>Thu Oct 22 17:19:21 2026 GMT</Update_Time><Dtd_File>http://www.fly.faa.gov/AirportStatus.dtd</Dtd_File>
<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>LGA</ARPT><Reason>airport volume</Reason><End_Time>2:15 pm EDT</End_Time></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>AUS</ARPT><Reason>runway construction</Reason><Avg>35 minutes</Avg><Max>2 hours and 2 minutes</Max></Ground_Delay><Ground_Delay><ARPT>SFO</ARPT><Reason>low ceilings</Reason><Avg>1 hour and 5 minutes</Avg><Max>2 hours</Max></Ground_Delay></Ground_Delay_List></Delay_type>
<Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><Delay><ARPT>EWR</ARPT><Reason>VOL:Volume</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type>
<Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>!LAX 10/123 LAX AD AP CLSD TO NON SKED TRANSIENT GA ACFT &amp; more</Reason><Start>Oct 01 at 06:00 UTC.</Start><Reopen>Dec 31 at 07:59 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`;

describe('FAA NAS status parser', () => {
  const status = parseFaaStatus(FAA_XML);

  it('reads the update time and every event with its category', () => {
    expect(status.updateTime).toBe('Thu Oct 22 17:19:21 2026 GMT');
    expect(status.events.map((e) => `${e.airport}:${e.category}`)).toEqual([
      'LGA:Ground Stop Programs',
      'AUS:Ground Delay Programs',
      'SFO:Ground Delay Programs',
      'EWR:General Arrival/Departure Delay Info',
      'LAX:Airport Closures',
    ]);
  });

  it('keeps the details: delay sizes, direction, closure window and decoded text', () => {
    const sfo = status.events.find((e) => e.airport === 'SFO');
    expect(sfo?.reason).toBe('low ceilings');
    expect(sfo?.avgDelay).toBe('1 hour and 5 minutes');
    const ewr = status.events.find((e) => e.airport === 'EWR');
    expect(ewr?.direction).toBe('Departure');
    expect(ewr?.trend).toBe('Increasing');
    const lax = status.events.find((e) => e.airport === 'LAX');
    expect(lax?.reopen).toBe('Dec 31 at 07:59 UTC.');
    expect(lax?.reason).toContain('& more');
  });

  it('returns no events for an empty or unexpected feed', () => {
    expect(parseFaaStatus('<AIRPORT_STATUS_INFORMATION></AIRPORT_STATUS_INFORMATION>').events).toEqual([]);
    expect(parseFaaStatus('not xml').events).toEqual([]);
  });
});

describe('METAR mapping', () => {
  it('maps the fields we show and ignores rows without a station', () => {
    // Fields as returned by the live NOAA API for KLAX on 2026-10-22.
    const m = mapMetar({ icaoId: 'KLAX', reportTime: '2026-10-22T17:00:00.000Z', wdir: 110, wspd: 7, visib: '10+', cover: 'BKN', fltCat: 'VFR', rawOb: 'METAR KLAX 221653Z 11007KT 10SM' });
    expect(m).toEqual({ icao: 'KLAX', observedAt: '2026-10-22T17:00:00.000Z', flightCategory: 'VFR', windDirDeg: 110, windKt: 7, visibility: '10+', cloudCover: 'BKN', raw: 'METAR KLAX 221653Z 11007KT 10SM' });
    expect(mapMetar({ temp: 10 })).toBeNull();
  });
});

describe('rate limit', () => {
  it('allows 20 requests per 10 minutes per key, then blocks until the window passes', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowRequest('ip-a', t0 + i)).toBe(true);
    expect(allowRequest('ip-a', t0 + 100)).toBe(false);
    expect(allowRequest('ip-b', t0 + 100)).toBe(true);
    expect(allowRequest('ip-a', t0 + 10 * 60 * 1000 + 50)).toBe(true);
  });
});

describe('curated constraints file', () => {
  it('has a source URL and an as-of date for every entry', () => {
    const raw = JSON.parse(readFileSync(new URL('../../../data/constraints.json', import.meta.url), 'utf8'));
    const rows = validateConstraints(raw);
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.airport)).toEqual(['SNA', 'SNA', 'SFO', 'SFO']);
  });

  it('rejects an entry without a source', () => {
    expect(() => validateConstraints([{ airport: 'SFO', kind: 'x', summary: 'y', sourceUrl: '', asOf: '2026-01-01' }])).toThrow(/sourceUrl/);
  });
});
