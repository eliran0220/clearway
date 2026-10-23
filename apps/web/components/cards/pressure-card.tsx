import { Check, ExternalLink, Minus } from 'lucide-react';
import type { Envelope, PressureData } from '@/lib/types';
import { compact, pct, pts, signedPct } from '@/lib/format';
import { Card } from '../card';
import { LoadFactorLine } from '../sparkline';

const LEVEL = {
  high: { text: 'High demand pressure', style: 'bg-brand-1 text-white' },
  moderate: { text: 'Moderate demand pressure', style: 'bg-tint text-brand-2' },
  low: { text: 'Low demand pressure', style: 'bg-tint text-muted' },
  insufficient_data: { text: 'Not enough data', style: 'bg-critical-bg text-critical' },
} as const;

export function PressureCard({ envelope }: { envelope: Envelope<PressureData> }) {
  const d = envelope.data;
  const level = LEVEL[d.level];
  const m = d.metrics;
  return (
    <Card title={`Demand pressure: ${d.airport}`} envelope={envelope}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${level.style}`}>{level.text}</span>
        <span className="text-sm text-muted">{d.signalsMet} of 4 signals met</span>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {d.signals.map((s) => (
          <li key={s.id} className={`rounded-xl border px-3 py-2.5 ${s.met ? 'border-brand-2/40 bg-tint' : 'border-line'}`}>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {s.met ? <Check aria-hidden className="size-4 text-brand-2" /> : <Minus aria-hidden className="size-4 text-muted" />}
              {s.label}
              <span className="sr-only">{s.met === null ? '(cannot tell)' : s.met ? '(met)' : '(not met)'}</span>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">{s.evidence}</p>
          </li>
        ))}
      </ul>

      {/* Same two columns and gap as the signals above, so the stats start exactly under the right-hand signals. */}
      <div className="mt-4 grid items-end gap-x-2 gap-y-4 sm:grid-cols-2">
        <LoadFactorLine months={d.monthlyLoadFactorPct} benchmark={m.nationalLoadFactorPct} />
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Passengers, 12 months</dt>
          <dd className="text-right font-semibold">{compact(m.passengers12m)}</dd>
          <dt className="text-muted">Passenger growth</dt>
          <dd className="text-right font-semibold">{signedPct(m.passengerGrowthPct)}</dd>
          <dt className="text-muted">Seat growth</dt>
          <dd className="text-right font-semibold">{signedPct(m.seatGrowthPct)}</dd>
          <dt className="text-muted">Flight growth</dt>
          <dd className="text-right font-semibold">{signedPct(m.flightGrowthPct)}</dd>
          <dt className="text-muted">Supply gap</dt>
          <dd className="text-right font-semibold">{pts(m.supplyGapPts)}</dd>
          <dt className="text-muted">Delayed 15+ min</dt>
          <dd className="text-right font-semibold">{pct(m.delayRatePct)}</dd>
        </dl>
      </div>

      {d.constraints.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1.5 text-xs text-muted">Documented constraints</h4>
          <ul className="space-y-2">
            {d.constraints.map((c) => (
              <li key={c.kind} className="rounded-lg bg-watch-bg px-3 py-2 text-[13px] text-watch">
                {c.summary}{' '}
                <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                  source <ExternalLink aria-hidden className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h4 className="mb-1.5 text-xs text-muted">What this data cannot show</h4>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
          {d.cannotTell.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
