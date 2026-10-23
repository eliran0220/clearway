import { ExternalLink } from 'lucide-react';
import type { CongestionData, Envelope } from '@/lib/types';
import { alignedPcts, int } from '@/lib/format';
import { Card } from '../card';

type Airport = CongestionData['airports'][number];

const RATES = [
  { key: 'delayRatePct', label: 'Arrivals delayed 15+ min' },
  { key: 'cancelRatePct', label: 'Cancelled' },
] as const;

// Where delay minutes come from. The air-traffic-system share is the one compared across airports.
const CAUSES = [
  { key: 'carrier', label: 'Airline' },
  { key: 'lateAircraft', label: 'Late-arriving aircraft' },
  { key: 'nas', label: 'Air-traffic system (NAS)', higherKey: 'nasSharePct' },
  { key: 'weather', label: 'Weather' },
  { key: 'security', label: 'Security' },
] as const;

/** One row of percentages; the airport that is higher on a compared metric is highlighted. */
function PctRow({ label, values, higher }: { label: string; values: (number | null)[]; higher: (i: number) => boolean }) {
  const shown = alignedPcts(values);
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 text-muted">{label}</td>
      {shown.map((v, i) => (
        <td key={i} className="py-2 pl-3 text-right">
          {/* The highlight bleeds by its own padding, so highlighted numbers stay in line with the rest. */}
          <span className={higher(i) ? '-mx-1.5 rounded-md bg-watch-bg px-1.5 py-0.5 font-semibold text-watch' : ''}>{v}</span>
          {higher(i) && <span className="sr-only"> (higher)</span>}
        </td>
      ))}
    </tr>
  );
}

export function CongestionCard({ envelope }: { envelope: Envelope<CongestionData> }) {
  const d = envelope.data;
  const isHigher = (metric: string) => (i: number) => d.higherOn[metric] === d.airports[i]?.airport;
  const cause = (key: (typeof CAUSES)[number]['key']) => d.airports.map((a: Airport) => a.delayCausesPct[key]);

  return (
    <Card title={`Congestion: ${d.airports.map((a) => a.airport).join(' and ')}`} envelope={envelope}>
      {/* -mx-2 px-2 gives highlights room to bleed without making the scroll box overflow. */}
      <div className="-mx-2 overflow-x-auto px-2">
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
            {RATES.map((m) => (
              <PctRow key={m.key} label={m.label} values={d.airports.map((a) => a[m.key])} higher={isHigher(m.key)} />
            ))}
            <tr className="border-t border-line">
              <td className="py-2 pr-3 text-muted">Arrivals counted</td>
              {d.airports.map((a) => (
                <td key={a.airport} className="py-2 pl-3 text-right">
                  {int(a.arrivals)}
                </td>
              ))}
            </tr>
          </tbody>
          <tbody>
            <tr>
              <th colSpan={d.airports.length + 1} className="pb-2 pt-5 text-left text-xs font-medium text-muted">
                Where delay minutes come from
              </th>
            </tr>
            {CAUSES.map((c) => (
              <PctRow key={c.key} label={c.label} values={cause(c.key)} higher={'higherKey' in c ? isHigher(c.higherKey) : () => false} />
            ))}
          </tbody>
        </table>
      </div>

      {d.constraints.length > 0 && (
        <ul className="mt-4 space-y-2">
          {d.constraints.map((c) => (
            <li key={`${c.airport}-${c.kind}`} className="border-l-2 border-watch/70 pl-3 text-[13px] leading-relaxed">
              <span className="font-semibold">{c.airport}:</span> {c.summary}{' '}
              <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-muted underline underline-offset-2 hover:text-ink">
                source <ExternalLink aria-hidden className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
