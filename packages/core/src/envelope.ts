// The evidence envelope every agent tool returns. The UI renders it as the evidence footer,
// and the agent may only state numbers that appear inside `data`.

export const METHODOLOGY_VERSION = 'screening-v1';

/** live-api: fetched during the question. cached-api: fetched by the daily job. file: an imported official export. curated: a reviewed, sourced fact. */
export type SourceKind = 'live-api' | 'cached-api' | 'file' | 'curated';

export interface SourceRef {
  id: string; // 'bts-monthly-api', 't100-segment-file', 'faa-nas-status'...
  label: string; // human-readable name shown in the UI
  kind: SourceKind;
  url?: string;
  retrievedAt: string; // ISO timestamp of the fetch or import
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Period {
  start: string; // 'YYYY-MM'
  end: string; // 'YYYY-MM'
}

export interface ToolResult<T> {
  data: T;
  period: Period | null;
  sources: SourceRef[];
  assumptions: string[];
  confidence: Confidence;
  warnings: string[];
  methodology: string;
}

export function toolResult<T>(
  data: T,
  meta: {
    period: Period | null;
    sources: SourceRef[];
    assumptions?: string[];
    confidence: Confidence;
    warnings?: string[];
    methodology?: string;
  },
): ToolResult<T> {
  return {
    data,
    period: meta.period,
    sources: meta.sources,
    assumptions: meta.assumptions ?? [],
    confidence: meta.confidence,
    warnings: meta.warnings ?? [],
    methodology: meta.methodology ?? METHODOLOGY_VERSION,
  };
}
