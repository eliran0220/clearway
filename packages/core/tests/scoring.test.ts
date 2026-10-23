import { describe, it, expect } from 'vitest';
import {
  SCREENING_V1,
  demandPressure,
  normalize,
  rankCandidates,
  scenarioWeights,
  scoreCandidate,
  withWeights,
  type Candidate,
} from '../src/scoring';

// SYNTHETIC candidates. They exercise the rules, they do not describe real airports.
const make = (airport: string, p: Partial<Candidate> = {}): Candidate => ({
  airport,
  passengersW1: 1_000_000,
  passengerGrowth: 0.05,
  supplyGap: 0.01,
  loadFactor: 0.82,
  delayRate: 0.2,
  ...p,
});

describe('normalization', () => {
  it('maps the low end to 0, the high end to 1 and clamps outside the range', () => {
    const spec = { low: -0.05, high: 0.15 };
    expect(normalize(-0.05, spec)).toBe(0);
    expect(normalize(0.15, spec)).toBe(1);
    expect(normalize(0.05, spec)).toBeCloseTo(0.5, 10);
    expect(normalize(-0.4, spec)).toBe(0);
    expect(normalize(0.9, spec)).toBe(1);
  });
});

describe('expansion screening score', () => {
  it('weights sum to 1 in the default methodology', () => {
    const sum = Object.values(SCREENING_V1.components).reduce((s, c) => s + c.weight, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it('scores a maxed-out airport 100 and a floor airport 0', () => {
    const top = scoreCandidate(make('TOP', { passengerGrowth: 0.3, loadFactor: 0.99, delayRate: 0.5, supplyGap: 0.1 }));
    const floor = scoreCandidate(make('LOW', { passengerGrowth: -0.2, loadFactor: 0.5, delayRate: 0, supplyGap: -0.1 }));
    expect(top.status === 'scored' && top.score).toBe(100);
    expect(floor.status === 'scored' && floor.score).toBe(0);
  });

  it('returns every component with raw value, weight and points', () => {
    const r = scoreCandidate(make('BOS'));
    if (r.status !== 'scored') throw new Error('expected scored');
    expect(r.components.map((c) => c.key)).toEqual(['growth', 'loadFactor', 'delay', 'supplyGap']);
    const total = r.components.reduce((s, c) => s + c.points, 0);
    expect(r.score).toBeCloseTo(total, 1);
  });

  it('marks an airport with a missing component as not scored, without re-weighting', () => {
    const r = scoreCandidate(make('PVD', { delayRate: null }));
    expect(r.status).toBe('not_scored');
    expect(r.status !== 'scored' && r.reason).toContain('delay pressure');
  });

  it('marks airports below the passenger threshold as ineligible', () => {
    const r = scoreCandidate(make('RUT', { passengersW1: 20_000 }));
    expect(r.status).toBe('ineligible');
  });

  it('is deterministic and breaks ties by airport code', () => {
    const input = [make('PWM'), make('BDL'), make('MHT')];
    const a = rankCandidates(input);
    const b = rankCandidates([...input].reverse());
    expect(a.ranked.map((r) => r.airport)).toEqual(['BDL', 'MHT', 'PWM']);
    expect(b).toEqual(a);
  });

  it('does not change an airport score when other airports are added (fixed ranges)', () => {
    const alone = rankCandidates([make('BOS')]).ranked[0].score;
    const withPeers = rankCandidates([make('BOS'), make('XXX', { passengerGrowth: 0.4 })]).ranked.find((r) => r.airport === 'BOS')?.score;
    expect(withPeers).toBe(alone);
  });

  it('lists excluded airports with reasons next to the ranking', () => {
    const r = rankCandidates([make('BOS'), make('RUT', { passengersW1: 5_000 }), make('PVD', { loadFactor: null })]);
    expect(r.ranked.map((x) => x.airport)).toEqual(['BOS']);
    expect(r.excluded.map((x) => x.airport)).toEqual(['PVD', 'RUT']);
  });

  it('applies a weight scenario as a new named config and rejects weights that do not sum to 1', () => {
    const delayHeavy = make('DLY', { delayRate: 0.35, passengerGrowth: -0.05 });
    const growthHeavy = make('GRW', { delayRate: 0, passengerGrowth: 0.15 });
    expect(rankCandidates([delayHeavy, growthHeavy]).ranked[0].airport).toBe('GRW');

    const scenario = withWeights(SCREENING_V1, { growth: 0.1, delay: 0.45 }, 'more weight on delays');
    const r = rankCandidates([delayHeavy, growthHeavy], scenario);
    expect(r.scenario).toBe('more weight on delays');
    expect(r.ranked[0].airport).toBe('DLY');
    expect(SCREENING_V1.components.delay.weight).toBe(0.2); // default untouched

    expect(() => withWeights(SCREENING_V1, { growth: 0.5 }, 'bad')).toThrow(/sum to 1/);
  });
});

describe('weight scenarios from partial overrides', () => {
  it('keeps the override and spreads the rest in default proportions', () => {
    // Default: growth 0.35, loadFactor 0.30, delay 0.20, supplyGap 0.15. Delay -> 0.10 leaves 0.90 for the other three (default sum 0.80).
    const s = scenarioWeights(SCREENING_V1, { delay: 0.1 }, 'less weight on delays');
    expect(s.components.delay.weight).toBe(0.1);
    expect(s.components.growth.weight).toBeCloseTo((0.9 * 0.35) / 0.8, 12);
    expect(s.components.loadFactor.weight).toBeCloseTo((0.9 * 0.3) / 0.8, 12);
    const sum = Object.values(s.components).reduce((t, c) => t + c.weight, 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(s.scenario).toBe('less weight on delays');
  });

  it('rejects overrides above 1 in total or out of range', () => {
    expect(() => scenarioWeights(SCREENING_V1, { delay: 0.7, growth: 0.5 }, 'bad')).toThrow(/more than 1/);
    expect(() => scenarioWeights(SCREENING_V1, { delay: -0.1 }, 'bad')).toThrow(/between 0 and 1/);
  });

  it('is deterministic', () => {
    expect(scenarioWeights(SCREENING_V1, { growth: 0.5 }, 'x')).toEqual(scenarioWeights(SCREENING_V1, { growth: 0.5 }, 'x'));
  });
});

describe('demand pressure', () => {
  it('labels 3 or more met signals as high and lists the evidence', () => {
    const r = demandPressure({ loadFactor: 0.88, supplyGap: 0.02, delayRate: 0.27, nasShare: 0.3, documentedConstraints: 1 });
    expect(r.metCount).toBe(4);
    expect(r.level).toBe('high');
    expect(r.signals[0].evidence).toContain('88%');
  });

  it('labels 2 met signals as moderate', () => {
    const r = demandPressure({ loadFactor: 0.9, supplyGap: 0.01, delayRate: 0.1, nasShare: 0.1, documentedConstraints: 0 });
    expect(r.level).toBe('moderate');
  });

  it('judges "planes are full" against the national benchmark when one is given', () => {
    const base = { supplyGap: 0, delayRate: 0.1, nasShare: 0.1, documentedConstraints: 0 };
    const above = demandPressure({ ...base, loadFactor: 0.84, loadFactorBenchmark: 0.83 });
    expect(above.signals[0].met).toBe(true);
    expect(above.signals[0].evidence).toBe('84% of seats filled, against 83% nationally');
    const below = demandPressure({ ...base, loadFactor: 0.82, loadFactorBenchmark: 0.83 });
    expect(below.signals[0].met).toBe(false);
    const equal = demandPressure({ ...base, loadFactor: 0.83, loadFactorBenchmark: 0.83 });
    expect(equal.signals[0].met).toBe(false); // must be above, not equal
  });

  it('says insufficient data rather than guessing when inputs are missing', () => {
    const r = demandPressure({ loadFactor: null, supplyGap: null, delayRate: 0.3, nasShare: null, documentedConstraints: 0 });
    expect(r.level).toBe('insufficient_data');
    expect(r.signals[0].met).toBeNull();
  });
});

describe('signal evidence reads as plain language', () => {
  const base = { loadFactor: 0.84, delayRate: 0.2, nasShare: 0.2, documentedConstraints: 0, loadFactorBenchmark: 0.8 };
  it('describes the supply gap in words, not as a formula', () => {
    expect(demandPressure({ ...base, supplyGap: 0.021 }).signals[1].evidence).toBe('passengers grew 2.1 pts faster than seats');
    expect(demandPressure({ ...base, supplyGap: -0.004 }).signals[1].evidence).toBe('seats grew 0.4 pts faster than passengers');
    expect(demandPressure({ ...base, supplyGap: 0 }).signals[1].evidence).toBe('passengers grew as fast as seats');
  });
  it('says when no constraint is recorded', () => {
    expect(demandPressure({ ...base, supplyGap: 0 }).signals[3].evidence).toBe('none recorded in Clearway');
  });
});
