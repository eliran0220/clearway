import { ExternalLink } from 'lucide-react';
import type { CongestionData, Envelope } from '@/lib/types';
import { int, pct } from '@/lib/format';
import { Card } from '../card';

const METRICS = [
  { key: 'delayRatePct', label: 'Arrivals delayed 15+ min' },
  { key: 'cancelRatePct', label: 'Cancelled' },
  { key: 'nasSharePct', label: 'System (NAS) share of delay minutes' },
] as const;

const CAUSES = [
  { key: 'carrier', label: 'Airline', color: 'bg-brand-1' },
  { key: 'lateAircraft', label: 'Late aircraft', color: 'bg-brand-2' },
  { key: 'nas', label: 'System (NAS)', color: 'bg-brand-3' },
  { key: 'weather', label: 'Weather', color: 'bg-brand-4' },
  { key: 'security', label: 'Security', color: 'bg-muted' },
] as const;

export function CongestionCard({ envelope }: { envelope: Envelope<CongestionData> }) {
  const d = envelope.data;
  return (
    <Card title={`Congestion: ${d.airports.map((a) => a.airport).join(' and ')}`} envelope={envelope}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 pr-3 font-medium">Same 12 months</th>
              {d.airports.map((a) => (
                <th key={a.airport} className="pb-2 pr-3 font-semibold text-ink">
                  {a.airport}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key} className="border-t border-line">
                <td className="py-2 pr-3 text-muted">{m.label}</td>
                {d.airports.map((a) => {
                  const higher = d.higherOn[m.key] === a.airport;
                  return (
                    <td key={a.airport} className="py-2 pr-3">
                      <span className={higher ? 'rounded-md bg-watch-bg px-1.5 py-0.5 font-semibold text-watch' : ''}>{pct(a[m.key])}</span>
                      {higher && <span className="sr-only"> (higher)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-2 pr-3 text-muted">Arrivals counted</td>
              {d.airports.map((a) => (
                <td key={a.airport} className="py-2 pr-3">
                  {int(a.arrivals)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-xs text-muted">Where delay minutes come from</h4>
        <div className="space-y-2">
          {d.airports.map((a) => (
            <div key={a.airport} className="grid grid-cols-[2.75rem_1fr] items-center gap-3">
              <span className="text-sm font-semibold">{a.airport}</span>
              <span className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={CAUSES.map((c) => `${c.label} ${pct(a.delayCausesPct[c.key])}`).join(', ')}>
                {CAUSES.map((c) => (
                  <span key={c.key} className={c.color} style={{ width: `${a.delayCausesPct[c.key] ?? 0}%` }} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {CAUSES.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2.5 rounded-sm ${c.color}`} />
              {c.label}
            </li>
          ))}
        </ul>
      </div>

      {d.constraints.length > 0 && (
        <ul className="mt-4 space-y-2">
          {d.constraints.map((c) => (
            <li key={`${c.airport}-${c.kind}`} className="rounded-lg bg-watch-bg px-3 py-2 text-[13px] text-watch">
              <span className="font-semibold">{c.airport}:</span> {c.summary}{' '}
              <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                source <ExternalLink aria-hidden className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
