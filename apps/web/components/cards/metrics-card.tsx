import type { Envelope, MetricsData } from '@/lib/types';
import { compact, pct, pts, signedPct } from '@/lib/format';
import { Card } from '../card';

export function MetricsCard({ envelope }: { envelope: Envelope<MetricsData> }) {
  const d = envelope.data;
  return (
    <Card title={`Traffic: ${d.airports.map((a) => a.airport).join(', ')}`} envelope={envelope}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 pr-3 font-medium">Airport</th>
              <th className="pb-2 pr-3 font-medium">Passengers</th>
              <th className="pb-2 pr-3 font-medium">Growth</th>
              <th className="pb-2 pr-3 font-medium">Flight growth</th>
              <th className="pb-2 pr-3 font-medium">Seat growth</th>
              <th className="pb-2 pr-3 font-medium">Supply gap</th>
              <th className="pb-2 pr-3 font-medium">Load factor</th>
            </tr>
          </thead>
          <tbody>
            {d.airports.map((a) => (
              <tr key={a.airport} className="border-t border-line">
                <td className="py-2 pr-3">
                  <span className="font-semibold">{a.airport}</span> <span className="text-muted">{a.name ?? ''}</span>
                </td>
                <td className="py-2 pr-3">{compact(a.passengers12m)}</td>
                <td className="py-2 pr-3">{signedPct(a.passengerGrowthPct)}</td>
                <td className="py-2 pr-3">{signedPct(a.flightGrowthPct)}</td>
                <td className="py-2 pr-3">{signedPct(a.seatGrowthPct)}</td>
                <td className="py-2 pr-3">{pts(a.supplyGapPts)}</td>
                <td className="py-2 pr-3">{pct(a.loadFactorPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.nationalLoadFactorPct != null && <p className="mt-2 text-xs text-muted">National load factor for the same months: {d.nationalLoadFactorPct}%</p>}
    </Card>
  );
}
