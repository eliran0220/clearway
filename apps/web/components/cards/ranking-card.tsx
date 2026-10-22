'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Envelope, RankingData } from '@/lib/types';
import { compact } from '@/lib/format';
import { Card } from '../card';

/** One color per score component, dusk to daylight, so segments differ in lightness as well as hue. */
export const COMPONENT_COLOR: Record<string, string> = {
  growth: 'bg-brand-1',
  loadFactor: 'bg-brand-2',
  delay: 'bg-brand-3',
  supplyGap: 'bg-brand-4',
};

const rawText = (raw: { value: number | null; unit: string }) =>
  raw.value == null ? 'n/a' : raw.unit === 'pts' ? `${raw.value > 0 ? '+' : ''}${raw.value} pts` : `${raw.value}%`;

export function RankingCard({ envelope }: { envelope: Envelope<RankingData> }) {
  const d = envelope.data;
  const [open, setOpen] = useState<string | null>(d.ranked[0]?.airport ?? null);
  const [showExcluded, setShowExcluded] = useState(false);
  const firstComponents = d.ranked[0]?.components ?? [];
  const isScenario = d.scenario !== 'default';

  return (
    <Card
      title={`Expansion screening${d.region ? `: ${d.region}` : ''}`}
      envelope={envelope}
      aside={isScenario ? <span className="rounded-full bg-watch-bg px-2.5 py-0.5 text-xs font-semibold text-watch">Scenario: {d.scenario}</span> : undefined}
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Score components and weights">
        {firstComponents.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-sm ${COMPONENT_COLOR[c.key] ?? 'bg-muted'}`} />
            {c.label} {c.weightPct}%
          </li>
        ))}
      </ul>

      <ol className="space-y-1.5">
        {d.ranked.map((r) => {
          const expanded = open === r.airport;
          return (
            <li key={r.airport}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.airport)}
                aria-expanded={expanded}
                className={`grid w-full grid-cols-[1.5rem_minmax(0,9rem)_1fr_2.75rem] items-center gap-3 rounded-xl border px-3 py-2.5 text-left sm:grid-cols-[1.5rem_minmax(0,13rem)_1fr_3rem] ${
                  expanded ? 'border-brand-2/40 bg-tint' : 'border-transparent hover:bg-tint/60'
                }`}
              >
                <span className="text-sm text-muted">{r.rank}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{r.airport}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.name ?? ''} {r.passengers12m != null && <>({compact(r.passengers12m)} passengers)</>}
                  </span>
                </span>
                <span className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden>
                  {r.components.map((c) => (
                    <span key={c.key} className={COMPONENT_COLOR[c.key] ?? 'bg-muted'} style={{ width: `${c.points}%` }} />
                  ))}
                </span>
                <span className="text-right text-base font-bold">{r.score}</span>
              </button>
              {expanded && (
                <div className="mt-1.5 grid gap-2 px-1 pb-1 sm:grid-cols-4">
                  {r.components.map((c) => (
                    <div key={c.key} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <span aria-hidden className={`size-2 rounded-sm ${COMPONENT_COLOR[c.key] ?? 'bg-muted'}`} />
                        {c.label}
                      </div>
                      <div className="text-lg font-bold">{rawText(c.raw)}</div>
                      <div className="text-xs text-muted">
                        {c.points} of {c.weightPct} points
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {d.notRanked.length > 0 && (
        <div className="mt-3 text-[13px]">
          <button type="button" onClick={() => setShowExcluded((s) => !s)} aria-expanded={showExcluded} className="flex items-center gap-1 text-muted hover:text-ink">
            {d.counts
              ? `${d.counts.belowPassengerThreshold} below ${compact(d.minPassengers)} passengers, ${d.counts.missingData} missing data`
              : `${d.notRanked.length} airports not ranked`}
            <ChevronDown aria-hidden className={`size-4 transition-transform ${showExcluded ? 'rotate-180' : ''}`} />
          </button>
          {showExcluded && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {d.notRanked.map((n) => (
                <li key={n.airport} className="text-muted">
                  <span className="font-semibold text-ink">{n.airport}</span> {n.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
