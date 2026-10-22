// Expansion screening score and demand-pressure assessment. Methodology: screening-v1.
// Fixed normalization ranges (not min-max within the group), so an airport's score
// does not change when other airports are added or removed.

export type ComponentKey = 'growth' | 'loadFactor' | 'delay' | 'supplyGap';

export interface ComponentSpec {
  label: string;
  low: number; // maps to 0
  high: number; // maps to 1
  weight: number;
}

export interface ScreeningConfig {
  version: string;
  scenario: string;
  minPassengers: number;
  components: Record<ComponentKey, ComponentSpec>;
}

export const SCREENING_V1: ScreeningConfig = {
  version: 'screening-v1',
  scenario: 'default',
  minPassengers: 100_000,
  components: {
    growth: { label: 'Demand growth', low: -0.05, high: 0.15, weight: 0.35 },
    loadFactor: { label: 'Seat occupancy', low: 0.7, high: 0.95, weight: 0.3 },
    delay: { label: 'Delay pressure', low: 0, high: 0.35, weight: 0.2 },
    supplyGap: { label: 'Supply gap', low: 0, high: 0.05, weight: 0.15 },
  },
};

export interface Candidate {
  airport: string;
  passengersW1: number | null;
  passengerGrowth: number | null;
  supplyGap: number | null;
  loadFactor: number | null;
  delayRate: number | null;
}

export interface ScoredComponent {
  key: ComponentKey;
  label: string;
  raw: number;
  normalized: number;
  weight: number;
  points: number; // contribution to the 0-100 score
}

export type ScreeningResult =
  | { airport: string; status: 'scored'; score: number; components: ScoredComponent[] }
  | { airport: string; status: 'not_scored' | 'ineligible'; reason: string };

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const normalize = (x: number, spec: Pick<ComponentSpec, 'low' | 'high'>) =>
  clamp01((x - spec.low) / (spec.high - spec.low));

const round = (x: number, digits = 1) => Math.round(x * 10 ** digits) / 10 ** digits;

const RAW: Record<ComponentKey, (c: Candidate) => number | null> = {
  growth: (c) => c.passengerGrowth,
  loadFactor: (c) => c.loadFactor,
  delay: (c) => c.delayRate,
  supplyGap: (c) => c.supplyGap,
};

/** Returns a new config with replaced weights. Throws unless the weights sum to 1. */
export function withWeights(
  base: ScreeningConfig,
  weights: Partial<Record<ComponentKey, number>>,
  scenario: string,
): ScreeningConfig {
  const components = structuredClone(base.components);
  for (const [k, w] of Object.entries(weights) as [ComponentKey, number][]) {
    if (w < 0) throw new Error(`Weight for ${k} must be >= 0`);
    components[k].weight = w;
  }
  const sum = Object.values(components).reduce((s, c) => s + c.weight, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`Weights must sum to 1, got ${round(sum, 3)}`);
  return { ...base, components, scenario };
}

export function scoreCandidate(c: Candidate, cfg: ScreeningConfig = SCREENING_V1): ScreeningResult {
  if (c.passengersW1 == null) return { airport: c.airport, status: 'not_scored', reason: 'passenger total unavailable for the window' };
  if (c.passengersW1 < cfg.minPassengers) {
    return { airport: c.airport, status: 'ineligible', reason: `${c.passengersW1.toLocaleString('en-US')} passengers is below the ${cfg.minPassengers.toLocaleString('en-US')} threshold` };
  }
  const missing = (Object.keys(cfg.components) as ComponentKey[]).filter((k) => RAW[k](c) == null);
  if (missing.length > 0) {
    // No silent re-weighting: an incomplete airport is shown, but not scored.
    return { airport: c.airport, status: 'not_scored', reason: `missing ${missing.map((k) => cfg.components[k].label.toLowerCase()).join(', ')}` };
  }
  const components = (Object.keys(cfg.components) as ComponentKey[]).map((key) => {
    const spec = cfg.components[key];
    const raw = RAW[key](c) as number;
    const normalized = normalize(raw, spec);
    return { key, label: spec.label, raw, normalized, weight: spec.weight, points: 100 * spec.weight * normalized };
  });
  const score = round(components.reduce((s, x) => s + x.points, 0));
  return { airport: c.airport, status: 'scored', score, components };
}

export interface Ranking {
  methodology: string;
  scenario: string;
  ranked: Extract<ScreeningResult, { status: 'scored' }>[];
  excluded: Exclude<ScreeningResult, { status: 'scored' }>[];
}

/** Deterministic ranking: score descending, then airport code ascending. */
export function rankCandidates(candidates: Candidate[], cfg: ScreeningConfig = SCREENING_V1): Ranking {
  const results = candidates.map((c) => scoreCandidate(c, cfg));
  const ranked = results
    .filter((r): r is Extract<ScreeningResult, { status: 'scored' }> => r.status === 'scored')
    .sort((a, b) => b.score - a.score || a.airport.localeCompare(b.airport));
  const excluded = results
    .filter((r): r is Exclude<ScreeningResult, { status: 'scored' }> => r.status !== 'scored')
    .sort((a, b) => a.airport.localeCompare(b.airport));
  return { methodology: cfg.version, scenario: cfg.scenario, ranked, excluded };
}

// ---------- demand pressure (the SFO question) ----------

export interface PressureInput {
  loadFactor: number | null;
  supplyGap: number | null;
  delayRate: number | null;
  nasShare: number | null;
  documentedConstraints: number; // count of sourced constraints for the airport
}

export interface Signal {
  id: 'full_planes' | 'demand_outpacing_supply' | 'operations_strained' | 'documented_constraint';
  label: string;
  met: boolean | null; // null = cannot tell
  evidence: string;
}

export type PressureLevel = 'low' | 'moderate' | 'high' | 'insufficient_data';

export const PRESSURE_THRESHOLDS = { loadFactor: 0.85, delayRate: 0.25, nasShare: 0.4 } as const;

const pct = (x: number) => `${round(x * 100)}%`;

export function demandPressure(input: PressureInput): { signals: Signal[]; metCount: number; level: PressureLevel } {
  const t = PRESSURE_THRESHOLDS;
  const signals: Signal[] = [
    {
      id: 'full_planes',
      label: 'Planes are full',
      met: input.loadFactor == null ? null : input.loadFactor >= t.loadFactor,
      evidence: input.loadFactor == null ? 'load factor unavailable' : `load factor ${pct(input.loadFactor)} (threshold ${pct(t.loadFactor)})`,
    },
    {
      id: 'demand_outpacing_supply',
      label: 'Demand outpacing seats',
      met: input.supplyGap == null ? null : input.supplyGap > 0,
      evidence: input.supplyGap == null ? 'growth unavailable' : `passenger growth minus seat growth = ${round(input.supplyGap * 100)} pp`,
    },
    {
      id: 'operations_strained',
      label: 'Operations strained',
      met:
        input.delayRate == null && input.nasShare == null
          ? null
          : (input.delayRate ?? 0) >= t.delayRate || (input.nasShare ?? 0) > t.nasShare,
      evidence: [
        input.delayRate == null ? 'delay rate unavailable' : `delay rate ${pct(input.delayRate)}`,
        input.nasShare == null ? 'NAS share unavailable' : `NAS share of delay minutes ${pct(input.nasShare)}`,
      ].join('; '),
    },
    {
      id: 'documented_constraint',
      label: 'Documented capacity constraint',
      met: input.documentedConstraints > 0,
      evidence: `${input.documentedConstraints} sourced constraint(s)`,
    },
  ];
  const unknown = signals.filter((s) => s.met === null).length;
  const metCount = signals.filter((s) => s.met === true).length;
  const level: PressureLevel = unknown > 1 ? 'insufficient_data' : metCount >= 3 ? 'high' : metCount === 2 ? 'moderate' : 'low';
  return { signals, metCount, level };
}
