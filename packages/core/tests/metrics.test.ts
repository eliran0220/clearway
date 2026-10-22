import { describe, it, expect } from 'vitest';
import {
  alignedWindows,
  congestion,
  growth,
  loadFactor,
  longHaulShare,
  monthsEnding,
  shiftMonth,
  trafficSummary,
  type DelayRow,
  type SegmentRow,
  type TrafficRow,
} from '../src/metrics';

// All fixtures here are SYNTHETIC. Real figures are checked against imported source rows, never from memory.

const seg = (p: Partial<SegmentRow>): SegmentRow => ({
  dest: 'XXX', distanceMi: 500, departures: 1, seats: 150, serviceClass: 'F', ...p,
});

describe('months and windows', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-04', -12)).toBe('2025-04');
  });

  it('builds a 12-month window ending at the given month', () => {
    const w = monthsEnding('2026-04', 12);
    expect(w).toHaveLength(12);
    expect(w[0]).toBe('2025-05');
    expect(w.at(-1)).toBe('2026-04');
  });

  it('aligns peers on the latest month all of them reported', () => {
    const all = (end: string) => monthsEnding(end, 36); // three years of history per airport
    const result = alignedWindows({ SFO: all('2026-04'), LAX: all('2026-03').concat('2026-04'), SNA: all('2026-03') });
    expect(result?.end).toBe('2026-03');
    expect(result?.included).toEqual(['LAX', 'SFO', 'SNA']);
  });

  it('excludes an airport with a gap instead of zero-filling it', () => {
    const full = monthsEnding('2026-04', 24);
    const gappy = full.filter((m) => m !== '2025-09');
    const result = alignedWindows({ BOS: full, PVD: gappy });
    expect(result?.included).toEqual(['BOS']);
    expect(result?.excluded[0].airport).toBe('PVD');
    expect(result?.excluded[0].reason).toContain('2025-09');
  });
});

describe('growth and load factor', () => {
  it('returns unavailable, not zero or infinity, for a missing or zero baseline', () => {
    expect(growth(100, 0)).toBeNull();
    expect(growth(100, null)).toBeNull();
    expect(growth(null, 100)).toBeNull();
    expect(growth(110, 100)).toBeCloseTo(0.1, 10);
  });

  it('weights load factor by seats instead of averaging percentages', () => {
    // 90/100 = 90% and 1/10 = 10%. The average of percentages would be 50%; the correct answer is 91/110.
    expect(loadFactor([{ passengers: 90, seats: 100 }, { passengers: 1, seats: 10 }])).toBeCloseTo(91 / 110, 10);
  });

  it('computes growth, supply gap and load factor over aligned windows', () => {
    const w1 = monthsEnding('2026-04', 12);
    const w0 = monthsEnding('2025-04', 12);
    const rows: TrafficRow[] = [
      ...w0.map((month) => ({ month, passengers: 800, seats: 1000 })),
      ...w1.map((month) => ({ month, passengers: 900, seats: 1050 })),
    ];
    const s = trafficSummary(rows, w1, w0);
    expect(s.passengerGrowth).toBeCloseTo(0.125, 10); // 900/800 - 1
    expect(s.seatGrowth).toBeCloseTo(0.05, 10); // 1050/1000 - 1
    expect(s.supplyGap).toBeCloseTo(0.075, 10);
    expect(s.loadFactor).toBeCloseTo(900 / 1050, 10);
  });

  it('computes flight growth from departures, and leaves it unavailable without them', () => {
    const w1 = monthsEnding('2026-04', 12);
    const w0 = monthsEnding('2025-04', 12);
    const rows: TrafficRow[] = [
      ...w0.map((month) => ({ month, passengers: 800, seats: 1000, departures: 10 })),
      ...w1.map((month) => ({ month, passengers: 900, seats: 1050, departures: 11 })),
    ];
    const s = trafficSummary(rows, w1, w0);
    expect(s.departuresW1).toBe(132);
    expect(s.flightGrowth).toBeCloseTo(0.1, 10); // 11/10 - 1
    const noDepartures = trafficSummary(rows.map(({ departures, ...r }) => r), w1, w0);
    expect(noDepartures.flightGrowth).toBeNull();
    expect(noDepartures.passengerGrowth).toBeCloseTo(0.125, 10);
  });

  it('marks a window with a missing month as unavailable', () => {
    const w1 = monthsEnding('2026-04', 12);
    const w0 = monthsEnding('2025-04', 12);
    const rows: TrafficRow[] = [...w0, ...w1].filter((m) => m !== '2026-01').map((month) => ({ month, passengers: 1, seats: 2 }));
    const s = trafficSummary(rows, w1, w0);
    expect(s.passengersW1).toBeNull();
    expect(s.passengerGrowth).toBeNull();
    expect(s.loadFactor).toBeNull();
  });
});

describe('congestion', () => {
  const row = (p: Partial<DelayRow>): DelayRow => ({
    arrFlights: 0, arrDel15: 0, arrCancelled: 0, carrierDelay: 0, weatherDelay: 0, nasDelay: 0, securityDelay: 0, lateAircraftDelay: 0, ...p,
  });

  it('computes rates from summed counts across carriers, not an average of carrier rates', () => {
    // Carrier A: 10/100 = 10%; carrier B: 9/10 = 90%. Average of rates = 50%; correct = 19/110.
    const c = congestion([row({ arrFlights: 100, arrDel15: 10 }), row({ arrFlights: 10, arrDel15: 9 })]);
    expect(c.delayRate).toBeCloseTo(19 / 110, 10);
  });

  it('reports the NAS share of delay minutes and keeps fractional counts', () => {
    const c = congestion([row({ arrFlights: 50, arrDel15: 12.5, nasDelay: 300, carrierDelay: 200, lateAircraftDelay: 500 })]);
    expect(c.delayed).toBe(12.5);
    expect(c.nasShare).toBeCloseTo(0.3, 10);
  });

  it('returns null rates when there are no flights', () => {
    expect(congestion([]).delayRate).toBeNull();
  });
});

describe('long-haul share', () => {
  it('weights by departures, not routes: 90 short + 10 long = 10%, not 50%', () => {
    const r = longHaulShare([seg({ dest: 'SEA', distanceMi: 1448, departures: 90 }), seg({ dest: 'ICN', distanceMi: 5300, departures: 10 })]);
    expect(r.share).toBeCloseTo(0.1, 10);
    expect(r.longHaulDepartures).toBe(10);
  });

  it('includes a route exactly at the threshold (rule is >=)', () => {
    const exactMi = 4000 / 1.609344;
    const r = longHaulShare([seg({ distanceMi: exactMi, departures: 1 })], { thresholdKm: 4000 });
    expect(r.share).toBe(1);
  });

  it('never counts unknown distances as short-haul; it warns and uses a known-distance denominator', () => {
    const r = longHaulShare([seg({ distanceMi: 5000, departures: 5 }), seg({ distanceMi: 100, departures: 5 }), seg({ distanceMi: null, departures: 10 })]);
    expect(r.share).toBeCloseTo(0.5, 10);
    expect(r.unknownDistanceDepartures).toBe(10);
    expect(r.warnings[0]).toContain('no distance');
  });

  it('passenger scope excludes cargo (service class G) and zero-seat rows', () => {
    const segments = [
      seg({ dest: 'ICN', distanceMi: 5300, departures: 30, serviceClass: 'G', seats: 0 }), // all-cargo
      seg({ dest: 'SEA', distanceMi: 1448, departures: 60, serviceClass: 'F' }),
      seg({ dest: 'FRA', distanceMi: 4700, departures: 10, serviceClass: 'F' }),
    ];
    expect(longHaulShare(segments, { scope: 'all' }).share).toBeCloseTo(0.4, 10);
    expect(longHaulShare(segments, { scope: 'passenger' }).share).toBeCloseTo(10 / 70, 10);
  });

  it('recomputes when the threshold changes (follow-up "now use 5,000 km")', () => {
    const segments = [seg({ distanceMi: 2800, departures: 50 }), seg({ distanceMi: 3500, departures: 50 })]; // 4,506 km and 5,633 km
    expect(longHaulShare(segments, { thresholdKm: 4000 }).share).toBe(1);
    expect(longHaulShare(segments, { thresholdKm: 5000 }).share).toBe(0.5);
  });

  it('lists the top long-haul destinations by departures', () => {
    const r = longHaulShare([seg({ dest: 'NRT', distanceMi: 3500, departures: 4 }), seg({ dest: 'ICN', distanceMi: 3800, departures: 9 })]);
    expect(r.topLongHaulDestinations.map((d) => d.dest)).toEqual(['ICN', 'NRT']);
  });
});
