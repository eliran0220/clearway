import type { Envelope, MetricsData } from '@/lib/types';
import { compact, pct, pts, signedPct } from '@/lib/format';
import { Card } from '../card';

const COLUMNS = ['Passengers', 'Growth', 'Flight growth', 'Seat growth', 'Supply gap', 'Load factor'];

export function MetricsCard({ envelope }: { envelope: Envelope<MetricsData> }) {
  const d = envelope.data;
  return (
    <Card title={`Traffic: ${d.airports.map((a) => a.airport).join(', ')}`} envelope={envelope}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-2 pr-3 text-left font-medium">Airport</th>
              {COLUMNS.map((c) => (
                <th key={c} className="whitespace-nowrap pb-2 pl-3 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.airports.map((a) => (
              <tr key={a.airport} className="border-t border-line">
                <td className="max-w-0 py-2 pr-3">
                  <span className="block font-semibold">{a.airport}</span>
                  <span className="block truncate text-xs text-muted" title={a.name ?? undefined}>
                    {a.name ?? ''}
                  </span>
                </td>
                <td className="py-2 pl-3 text-right">{compact(a.passengers12m)}</td>
                <td className="py-2 pl-3 text-right">{signedPct(a.passengerGrowthPct)}</td>
                <td className="py-2 pl-3 text-right">{signedPct(a.flightGrowthPct)}</td>
                <td className="py-2 pl-3 text-right">{signedPct(a.seatGrowthPct)}</td>
                <td className="py-2 pl-3 text-right">{pts(a.supplyGapPts)}</td>
                <td className="py-2 pl-3 text-right">{pct(a.loadFactorPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.nationalLoadFactorPct != null && <p className="mt-2 text-xs text-muted">National load factor for the same months: {pct(d.nationalLoadFactorPct)}</p>}
    </Card>
  );
}
