import { describe, it, expect } from 'vitest';
import {
  chooseEnd,
  delayCauseShares,
  distanceBands,
  foreignAirportWarnings,
  higherPerMetric,
  listedPlaces,
  matchAliases,
  normalizeCodes,
  rankBySize,
  resolveRegion,
  toCoreDelayRows,
  unmatchedPlaces,
  windowsEndingAt,
} from '../src/agent/analysis';

// SYNTHETIC inputs that exercise the rules.

describe('airport codes and aliases', () => {
  it('normalizes and rejects anything that is not a 3-character code', () => {
    expect(normalizeCodes([' sfo', 'SFO', 'lax'])).toEqual(['SFO', 'LAX']);
    expect(() => normalizeCodes(["SFO'; drop"])).toThrow(/Not airport codes/);
  });

  it('finds every city in order and says the LA assumption out loud', () => {
    const m = matchAliases('Compare LA and Santa Ana airport congestion levels');
    expect(m.codes).toEqual(['LAX', 'SNA']);
    expect(m.assumptions[0]).toContain('LAX');
  });

  it('maps San Francisco and Anchorage', () => {
    expect(matchAliases('unmet demand in San Francisco').codes).toEqual(['SFO']);
    expect(matchAliases('long-haul flights out of Anchorage').codes).toEqual(['ANC']);
  });

  it('does not treat words that merely contain "la" as Los Angeles', () => {
    expect(matchAliases('Atlanta and Orlando').codes).toEqual([]);
  });

  it('ranks large airports first', () => {
    const rows = [
      { iata: 'PVD', airportType: 'medium_airport' },
      { iata: 'BOS', airportType: 'large_airport' },
      { iata: 'ACK', airportType: 'small_airport' },
    ];
    expect(rankBySize(rows).map((r) => r.iata)).toEqual(['BOS', 'PVD', 'ACK']);
  });
});

describe('regions', () => {
  it('resolves New England to its six states', () => {
    expect(resolveRegion('New England')?.isoRegions).toEqual(['US-CT', 'US-ME', 'US-MA', 'US-NH', 'US-RI', 'US-VT']);
  });

  it('accepts state names and codes', () => {
    expect(resolveRegion('Texas')?.states).toEqual(['TX']);
    expect(resolveRegion('CA, OR')?.states).toEqual(['CA', 'OR']);
    expect(resolveRegion('california and oregon')?.states).toEqual(['CA', 'OR']);
  });

  it('returns null for text that is not a region', () => {
    expect(resolveRegion('LAX')).toBeNull();
    expect(resolveRegion('somewhere nice')).toBeNull();
  });
});

describe('windows', () => {
  it('uses the latest month every source has', () => {
    expect(chooseEnd(['2026-04', '2026-08']).end).toBe('2026-04');
  });

  it('caps a requested month that is past the data, with a warning, and honors an earlier one', () => {
    const capped = chooseEnd(['2026-04'], '2026-09');
    expect(capped.end).toBe('2026-04');
    expect(capped.warning).toContain('2026-04');
    expect(chooseEnd(['2026-04'], '2025-12').end).toBe('2025-12');
  });

  it('refuses to pick a window when a source has no data', () => {
    expect(chooseEnd(['2026-04', null]).end).toBeNull();
  });

  it('builds the recent and prior 12-month windows', () => {
    const w = windowsEndingAt('2026-04');
    expect(w.period).toEqual({ start: '2025-05', end: '2026-04' });
    expect(w.w0[0]).toBe('2024-05');
    expect(w.w0.at(-1)).toBe('2025-04');
  });
});

describe('distance bands', () => {
  it('splits departures into three bands and ignores unknown distances', () => {
    const seg = (distanceMi: number | null, departures: number) => ({ dest: 'X', distanceMi, departures, seats: 100, serviceClass: 'F' });
    // 600 mi = 966 km (short), 1500 mi = 2,414 km (medium), 3000 mi = 4,828 km (long)
    const bands = distanceBands([seg(600, 50), seg(1500, 30), seg(3000, 20), seg(null, 99)], 4000);
    expect(bands.map((b) => b.departures)).toEqual([50, 30, 20]);
    expect(bands[2]?.share).toBeCloseTo(0.2, 10);
    expect(bands[2]?.label).toBe('4,000 km or more');
  });

  it('uses two bands when the threshold is below 1,500 km', () => {
    const bands = distanceBands([{ dest: 'X', distanceMi: 600, departures: 1, seats: 1, serviceClass: 'F' }], 1000);
    expect(bands).toHaveLength(2);
  });
});

describe('delays', () => {
  it('treats blank cells as zero inside sums and shares minutes by cause', () => {
    const rows = toCoreDelayRows([
      { arrFlights: 10, arrDel15: 2, arrCancelled: null, carrierDelay: 30, weatherDelay: null, nasDelay: 60, securityDelay: 0, lateAircraftDelay: 10 },
    ]);
    expect(rows[0]?.arrCancelled).toBe(0);
    const shares = delayCauseShares(rows);
    expect(shares.nas).toBeCloseTo(0.6, 10);
    expect(shares.carrier).toBeCloseTo(0.3, 10);
  });

  it('says which airport is higher per metric, with ties at one decimal', () => {
    const higher = higherPerMetric(
      [
        { airport: 'LAX', values: { delayRatePct: 19.3, nasSharePct: 15.2, cancelRatePct: 1.0 } },
        { airport: 'SNA', values: { delayRatePct: 18.0, nasSharePct: 16.9, cancelRatePct: 1.0 } },
      ],
      ['delayRatePct', 'nasSharePct', 'cancelRatePct'],
    );
    expect(higher).toEqual({ delayRatePct: 'LAX', nasSharePct: 'SNA', cancelRatePct: 'tie' });
  });
});

describe('edge cases found in the bug hunt', () => {
  it('does not read "La" in a place name as LA', () => {
    expect(matchAliases('Compare La Guardia and JFK').codes).toEqual([]);
    expect(matchAliases('La Crosse traffic').codes).toEqual([]);
    expect(matchAliases('Compare LA and Santa Ana').codes).toEqual(['LAX', 'SNA']);
    expect(matchAliases('L.A. vs Los Angeles').codes).toEqual(['LAX']);
    expect(matchAliases('L.A. vs Los Angeles').assumptions).toHaveLength(1);
  });

  it('warns that BTS figures for an airport abroad cover only its US flights', () => {
    const rows = [
      { iata: 'LHR', region: 'GB-ENG' },
      { iata: 'SJU', region: 'PR-U-A' },
      { iata: 'SFO', region: 'US-CA' },
    ];
    const w = foreignAirportWarnings(rows, ['LHR', 'SJU', 'SFO', 'XXX']);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('LHR is outside the US');
  });

  it('splits a list of places, keeping names with spaces whole', () => {
    expect(listedPlaces('La Guardia, Newark').map((p) => p.text)).toEqual(['La Guardia', 'Newark']);
    expect(listedPlaces('Boston and Providence vs. Hartford').map((p) => p.text)).toEqual(['Boston', 'Providence', 'Hartford']);
    expect(listedPlaces('Dallas/Fort Worth').map((p) => p.text)).toEqual(['Dallas', 'Fort Worth']);
    expect(listedPlaces('Portland International Jetport').map((p) => p.text)).toEqual(['Portland International Jetport']);
    expect(listedPlaces('  Newark ,  ')).toEqual([{ text: 'Newark', start: 2, end: 8 }]);
  });

  it('looks up names listed beside a code or a city alias instead of dropping them', () => {
    expect(unmatchedPlaces('La Guardia and JFK', matchAliases('La Guardia and JFK'))).toEqual(['La Guardia']);
    expect(unmatchedPlaces('LA and Burbank', matchAliases('LA and Burbank'))).toEqual(['Burbank']);
    expect(unmatchedPlaces('LA and Santa Ana', matchAliases('LA and Santa Ana'))).toEqual([]);
    expect(unmatchedPlaces('Washington, DC and Boston', matchAliases('Washington, DC and Boston'))).toEqual([]);
    expect(unmatchedPlaces('SFO, OAK', matchAliases('SFO, OAK'))).toEqual([]);
  });
});
