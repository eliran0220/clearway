// Shapes of the agent's tool results as the web app receives them. They mirror apps/api/src/agent/tools.ts.

export type SourceKind = 'live-api' | 'cached-api' | 'file' | 'curated';

export interface SourceRef {
  id: string;
  label: string;
  kind: SourceKind;
  url?: string;
  retrievedAt: string;
}

export interface Envelope<T> {
  data: T;
  period: { start: string; end: string } | null;
  sources: SourceRef[];
  assumptions: string[];
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  methodology: string;
}

export interface Constraint {
  airport?: string;
  kind: string;
  summary: string;
  sourceUrl: string;
  asOf: string;
}

export interface RankingData {
  region: string | null;
  methodology: string;
  scenario: string;
  weightsPct: Record<string, number>;
  ranges: Record<string, string>;
  minPassengers: number;
  ranked: {
    rank: number;
    airport: string;
    name: string | null;
    score: number;
    passengers12m: number | null;
    components: { key: string; label: string; raw: { value: number | null; unit: string }; normalized: number; weightPct: number; points: number }[];
  }[];
  notRanked: { airport: string; name: string | null; status: string; reason: string; passengers12m?: number | null }[];
  counts?: { checked: number; ranked: number; belowPassengerThreshold: number; missingData: number };
}

export interface CongestionAirport {
  airport: string;
  name: string | null;
  arrivals: number;
  delayedArrivals: number;
  delayRatePct: number | null;
  cancelRatePct: number | null;
  nasSharePct: number | null;
  delayCausesPct: { carrier: number | null; lateAircraft: number | null; nas: number | null; weather: number | null; security: number | null };
  departures12m: number | null;
}

export interface CongestionData {
  airports: CongestionAirport[];
  higherOn: Record<string, string | null>;
  difference: { between: string; delayRatePts: number | null; cancelRatePts: number | null; nasSharePts: number | null } | null;
  constraints: Constraint[];
}

export interface LongHaulData {
  airport: string;
  name: string | null;
  thresholdKm: number;
  thresholdMi: number;
  scope: 'all' | 'passenger';
  longHaulSharePct: number | null;
  longHaulDepartures: number;
  departuresWithDistance: number;
  departuresMissingDistance: number;
  bothScopes: { allServicesPct: number | null; passengerOnlyPct: number | null };
  bands: { label: string; departures: number; sharePct: number | null }[];
  topLongHaulDestinations: { code: string; name: string | null; country: string | null; departures: number; distanceKm: number }[];
}

export interface MonthlyLoadFactor {
  month: string;
  loadFactorPct: number | null;
}

export interface PressureData {
  airport: string;
  name: string | null;
  level: 'low' | 'moderate' | 'high' | 'insufficient_data';
  signalsMet: number;
  signals: { id: string; label: string; met: boolean | null; evidence: string }[];
  metrics: {
    passengers12m: number | null;
    loadFactorPct: number | null;
    nationalLoadFactorPct: number | null;
    passengerGrowthPct: number | null;
    seatGrowthPct: number | null;
    flightGrowthPct?: number | null;
    supplyGapPts: number | null;
    delayRatePct: number | null;
    nasSharePct: number | null;
  };
  monthlyLoadFactorPct: MonthlyLoadFactor[];
  constraints: Constraint[];
  cannotTell: string[];
}

export interface MetricsData {
  airports: {
    airport: string;
    name: string | null;
    passengers12m: number | null;
    passengersPrior12m: number | null;
    seats12m: number | null;
    departures12m?: number | null;
    passengerGrowthPct: number | null;
    seatGrowthPct: number | null;
    flightGrowthPct?: number | null;
    supplyGapPts: number | null;
    loadFactorPct: number | null;
    monthlyLoadFactorPct: MonthlyLoadFactor[];
  }[];
  nationalLoadFactorPct: number | null;
}

export interface FaaEvent {
  airport: string;
  category: string;
  reason: string | null;
  avgDelay: string | null;
  maxDelay: string | null;
  minDelay: string | null;
  trend: string | null;
  direction: string | null;
  endTime: string | null;
  start: string | null;
  reopen: string | null;
  notamText?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  permanent?: boolean;
  inForceNow?: boolean | null;
}

export interface LiveData {
  airports: {
    airport: string;
    name: string | null;
    faaEvents: FaaEvent[] | null;
    noActiveFaaEvents: boolean | null;
    weather: { icao: string; observedAt: string | null; flightCategory: string | null; windDirDeg: number | null; windKt: number | null; visibility: string | null; cloudCover: string | null; raw: string | null } | null;
  }[];
  faaUpdateTime: string | null;
}

/** A tool part of an assistant message, as the AI SDK streams it ("tool-<toolName>"). */
export interface ToolPart {
  type: string;
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}

export const isToolPart = (part: { type: string }): part is ToolPart => part.type.startsWith('tool-');
export const toolNameOf = (part: ToolPart) => part.type.slice('tool-'.length);
