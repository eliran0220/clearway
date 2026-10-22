import type { MonthlyLoadFactor } from '@/lib/types';
import { monthLabel } from '@/lib/format';

/** Monthly load factor as a line, with an optional dashed benchmark (the national load factor). */
export function LoadFactorLine({ months, benchmark, height = 64 }: { months: MonthlyLoadFactor[]; benchmark?: number | null; height?: number }) {
  const values = months.map((m) => m.loadFactorPct).filter((v): v is number => v != null);
  if (values.length < 2) return null;
  const width = 280;
  const all = benchmark != null ? [...values, benchmark] : values;
  const lo = Math.floor(Math.min(...all) - 2);
  const hi = Math.ceil(Math.max(...all) + 2);
  const x = (i: number) => (i / (months.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const points = months
    .map((m, i) => (m.loadFactorPct == null ? null : `${x(i).toFixed(1)},${y(m.loadFactorPct).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const first = months[0]?.month;
  const last = months.at(-1)?.month;
  const peak = Math.max(...values);
  const low = Math.min(...values);

  return (
    <figure className="w-full max-w-[20rem]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full overflow-visible" role="img" aria-label={`Monthly load factor from ${monthLabel(first)} to ${monthLabel(last)}, between ${low}% and ${peak}%`}>
        {benchmark != null && <line x1={0} x2={width} y1={y(benchmark)} y2={y(benchmark)} stroke="var(--cw-muted)" strokeDasharray="4 4" strokeWidth={1} />}
        <polyline points={points} fill="none" stroke="var(--cw-brand-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        <span className="flex justify-between">
          <span>{monthLabel(first)}</span>
          <span>{monthLabel(last)}</span>
        </span>
        <span className="block">
          Monthly {low}% to {peak}%{benchmark != null && <>; dashed line: national {benchmark}%</>}
        </span>
      </figcaption>
    </figure>
  );
}
