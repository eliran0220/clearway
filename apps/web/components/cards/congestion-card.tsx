import { ExternalLink } from 'lucide-react';
import type { CongestionData, Envelope } from '@/lib/types';
import { alignedPcts, int } from '@/lib/format';
import { Card } from '../card';

const METRICS = [
  { key: 'delayRatePct', label: 'Arrivals delayed 15+ min' },
  { key: 'cancelRatePct', label: 'Cancelled' },
  { key: 'nasSharePct', label: 'System (NAS) share of delay minutes' },
] as const;

const CAUSES = [
  { key: 'carrier', label: 'Airline', color: 'bg-chart-1' },
  { key: 'lateAircraft', label: 'Late aircraft', color: 'bg-chart-2' },
  { key: 'nas', label: 'System (NAS)', color: 'bg-chart-3' },
  { key: 'weather', label: 'Weather', color: 'bg-chart-4' },
  { key: 'security', label: 'Security', color: 'bg-chart-5' },
] as const;

export function CongestionCard({ envelope }: { envelope: Envelope<CongestionData> }) {
  const d = envelope.data;
  return (
    <Card title={`Congestion: ${d.airports.map((a) => a.airport).join(' and ')}`} envelope={envelope}>
      <div className="overflow-x-auto">
        {/* Both tables in this card share these columns, so each airport's numbers line up from top to bottom. */}
        <table className="w-full min-w-[22rem] table-fixed text-sm">
          <colgroup>
            <col />
            {d.airports.map((a) => (
              <col key={a.airport} className="w-24" />
            ))}
          </colgroup>
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-2 pr-3 text-left font-medium">Same 12 months</th>
              {d.airports.map((a) => (
                <th key={a.airport} className="pb-2 pl-3 text-right font-semibold text-ink">
                  {a.airport}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const shown = alignedPcts(d.airports.map((a) => a[m.key]));
              return (
                <tr key={m.key} className="border-t border-line">
                  <td className="py-2 pr-3 text-muted">{m.label}</td>
                  {d.airports.map((a, i) => {
                    const higher = d.higherOn[m.key] === a.airport;
                    return (
                      <td key={a.airport} className="py-2 pl-3 text-right">
                        {/* The highlight bleeds by its own padding, so highlighted numbers stay in line with the rest. */}
                        <span className={higher ? '-mx-1.5 rounded-md bg-watch-bg px-1.5 py-0.5 font-semibold text-watch' : ''}>{shown[i]}</span>
                        {higher && <span className="sr-only"> (higher)</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t border-line">
              <td className="py-2 pr-3 text-muted">Arrivals counted</td>
              {d.airports.map((a) => (
                <td key={a.airport} className="py-2 pl-3 text-right">
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
              <span className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-line" aria-hidden>
                {CAUSES.filter((c) => (a.delayCausesPct[c.key] ?? 0) > 0).map((c) => (
                  <span key={c.key} className={c.color} style={{ width: `${a.delayCausesPct[c.key] ?? 0}%` }} />
                ))}
              </span>
            </div>
          ))}
        </div>
        {/* The legend doubles as the values table, so no number lives only in a color. */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[22rem] table-fixed text-xs">
            <colgroup>
              <col />
              {d.airports.map((a) => (
                <col key={a.airport} className="w-24" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="pb-1 pr-3 text-left font-medium text-muted">Share of delay minutes</th>
                {d.airports.map((a) => (
                  <th key={a.airport} className="pb-1 pl-3 text-right font-semibold">
                    {a.airport}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAUSES.map((c) => {
                const shown = alignedPcts(d.airports.map((a) => a.delayCausesPct[c.key]));
                return (
                  <tr key={c.key}>
                    <td className="py-0.5 pr-3 text-muted">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${c.color}`} />
                        {c.label}
                      </span>
                    </td>
                    {d.airports.map((a, i) => (
                      <td key={a.airport} className="py-0.5 pl-3 text-right">
                        {shown[i]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
