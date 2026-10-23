import type { Envelope, MetricsData } from '@/lib/types';
import { columnDecimals, compact, listOf, pct, pts, signedPct } from '@/lib/format';
import { Card } from '../card';

// The three growth columns share one header, so each column's own label stays short enough to fit.
const GROWTH = ['Passengers', 'Flights', 'Seats'];
const single = 'whitespace-nowrap pb-2 pl-2 text-right align-bottom font-medium';

const DECIMAL_COLUMNS = ['passengerGrowthPct', 'flightGrowthPct', 'seatGrowthPct', 'supplyGapPts', 'loadFactorPct'] as const;

export function MetricsCard({ envelope }: { envelope: Envelope<MetricsData> }) {
  const d = envelope.data;
  // One number of decimals per column, so values line up (82.0% beside 80.8%).
  const dec = Object.fromEntries(DECIMAL_COLUMNS.map((k) => [k, columnDecimals(d.airports.map((a) => a[k]))])) as Record<(typeof DECIMAL_COLUMNS)[number], number>;
  return (
    <Card title={`Traffic: ${listOf(d.airports.map((a) => a.airport))}`} envelope={envelope}>
      <div className="overflow-x-auto">
        {/* Wide enough that every header (about 65 px) fits its column; on a phone the table scrolls sideways. */}
        <table className="w-full min-w-[42rem] table-fixed text-sm">
          <colgroup>
            <col className="w-[32%]" />
            {Array.from({ length: 6 }, (_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          <thead className="text-xs text-muted">
            <tr>
              <th rowSpan={2} scope="col" className="pb-2 pr-3 text-left align-bottom font-medium">
                Airport
              </th>
              <th rowSpan={2} scope="col" className={single}>
                Passengers
              </th>
              <th colSpan={3} scope="colgroup" className="pb-1 pl-2 text-center font-medium">
                <span className="block border-b border-line pb-1">Growth, year over year</span>
              </th>
              <th rowSpan={2} scope="col" className={single}>
                Supply gap
              </th>
              <th rowSpan={2} scope="col" className={single}>
                Load factor
              </th>
            </tr>
            <tr>
              {GROWTH.map((g) => (
                <th key={g} scope="col" className={single}>
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.airports.map((a) => (
              <tr key={a.airport} className="border-t border-line">
                <td className="py-2 pr-3">
                  <span className="block font-semibold">{a.airport}</span>
                  <span className="block truncate text-xs text-muted" title={a.name ?? undefined}>
                    {a.name ?? ''}
                  </span>
                </td>
                <td className="py-2 pl-2 text-right">{compact(a.passengers12m)}</td>
                <td className="py-2 pl-2 text-right">{signedPct(a.passengerGrowthPct, dec.passengerGrowthPct)}</td>
                <td className="py-2 pl-2 text-right">{signedPct(a.flightGrowthPct, dec.flightGrowthPct)}</td>
                <td className="py-2 pl-2 text-right">{signedPct(a.seatGrowthPct, dec.seatGrowthPct)}</td>
                <td className="py-2 pl-2 text-right">{pts(a.supplyGapPts, dec.supplyGapPts)}</td>
                <td className="py-2 pl-2 text-right">{pct(a.loadFactorPct, dec.loadFactorPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.nationalLoadFactorPct != null && <p className="mt-2 text-xs text-muted">National load factor for the same months: {pct(d.nationalLoadFactorPct)}</p>}
    </Card>
  );
}
