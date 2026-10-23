'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Envelope, RankingData } from '@/lib/types';
import { compact, num } from '@/lib/format';
import { Card } from '../card';

/** One chart color per score component; they differ in lightness as well as hue in both themes. */
export const COMPONENT_COLOR: Record<string, string> = {
  growth: 'bg-chart-1',
  loadFactor: 'bg-chart-2',
  delay: 'bg-chart-3',
  supplyGap: 'bg-chart-4',
};

const score1 = (n: number) => n.toFixed(1);

const rawText = (raw: { value: number | null; unit: string }) =>
  raw.value == null ? 'n/a' : raw.unit === 'pts' ? `${raw.value > 0 ? '+' : ''}${num(raw.value)} pts` : `${num(raw.value)}%`;

export function RankingCard({ envelope }: { envelope: Envelope<RankingData> }) {
  const d = envelope.data;
  const [open, setOpen] = useState<string | null>(d.ranked[0]?.airport ?? null);
  // With nothing ranked, the reasons are the whole answer, so they start open.
  const [showExcluded, setShowExcluded] = useState(d.ranked.length === 0);
  const firstComponents = d.ranked[0]?.components ?? [];
  const isScenario = d.scenario !== 'default';
  const belowThreshold = d.notRanked.filter((n) => n.status === 'ineligible');
  const missingData = d.notRanked.filter((n) => n.status !== 'ineligible');

  return (
    <Card
      title={`Expansion screening${d.region ? `: ${d.region}` : ''}`}
      envelope={envelope}
      aside={isScenario ? <span className="rounded-full bg-watch-bg px-2.5 py-0.5 text-xs font-semibold text-watch">Scenario: {d.scenario}</span> : undefined}
    >
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Score components and weights">
        {firstComponents.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-sm ${COMPONENT_COLOR[c.key] ?? 'bg-chart-5'}`} />
            {c.label} {c.weightPct}%
          </li>
        ))}
      </ul>

      {d.ranked.length === 0 && <p className="text-sm text-muted">No airport in this selection could be scored; the reasons are below.</p>}

      {/* The list bleeds by the rows' border and padding (13 px), so rank and score sit on the card's content edges. */}
      <ol className="-mx-[13px] space-y-1.5">
        {d.ranked.map((r) => {
          const expanded = open === r.airport;
          return (
            <li key={r.airport}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.airport)}
                aria-expanded={expanded}
                className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-left sm:grid-cols-[1.5rem_minmax(0,13rem)_1fr_3rem] ${
                  expanded ? 'border-brand-2/40 bg-tint' : 'border-transparent hover:bg-tint/60'
                }`}
              >
                <span className="text-sm text-muted">{r.rank}</span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold">{r.airport}</span>
                    {r.passengers12m != null && <span className="text-xs text-muted">{compact(r.passengers12m)} passengers</span>}
                  </span>
                  <span className="block truncate text-xs text-muted" title={r.name ?? undefined}>
                    {r.name ?? ''}
                  </span>
                </span>
                {/* On a phone the bar takes its own row under the name; from sm up it sits between name and score. */}
                <span className="col-span-2 col-start-2 row-start-2 flex h-3 gap-[2px] overflow-hidden rounded-full bg-line sm:col-span-1 sm:col-start-auto sm:row-start-auto" aria-hidden>
                  {r.components
                    .filter((c) => c.points > 0)
                    .map((c) => (
                      <span key={c.key} className={COMPONENT_COLOR[c.key] ?? 'bg-chart-5'} style={{ width: `${c.points}%` }} />
                    ))}
                </span>
                <span className="text-right text-base font-bold tabular-nums">{score1(r.score)}</span>
              </button>
              {expanded && (
                <div className="mx-[13px] mt-1.5 grid grid-cols-2 gap-2 pb-1 sm:grid-cols-4">
                  {r.components.map((c) => (
                    <div key={c.key} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <span aria-hidden className={`size-2 rounded-sm ${COMPONENT_COLOR[c.key] ?? 'bg-chart-5'}`} />
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
            <div className="mt-2 space-y-2.5">
              {belowThreshold.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs text-muted">Below {d.minPassengers.toLocaleString('en-US')} passengers in the 12 months</h4>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {belowThreshold.map((n) => (
                      <li key={n.airport} title={n.name ?? undefined}>
                        <span className="font-semibold">{n.airport}</span> <span className="text-muted">{n.passengers12m != null ? compact(n.passengers12m) : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {missingData.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs text-muted">Not scored: data missing</h4>
                  <ul className="space-y-0.5">
                    {missingData.map((n) => (
                      <li key={n.airport}>
                        <span className="font-semibold">{n.airport}</span> <span className="text-muted">{n.name ? `${n.name}: ` : ''}{n.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
