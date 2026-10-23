import { CloudSun, Radio } from 'lucide-react';
import type { Envelope, FaaEvent, LiveData } from '@/lib/types';
import { dayLabel, timeAgo } from '@/lib/format';
import { Card } from '../card';

const FLIGHT_CATEGORY: Record<string, string> = {
  VFR: 'Good visibility (VFR)',
  MVFR: 'Marginal visibility (MVFR)',
  IFR: 'Low visibility (IFR)',
  LIFR: 'Very low visibility (LIFR)',
};

/** The closure's validity, read from the NOTAM itself (the feed's own start and reopen times carry no year). */
function closureWindow(e: FaaEvent): string {
  // Non-breaking spaces keep each date on one line.
  const day = (iso: string | null | undefined) => dayLabel(iso).replace(/ /g, '\u00a0');
  if (e.permanent) return `: permanent, since ${day(e.validFrom)}`;
  if (!e.validFrom || !e.validTo) return '';
  if (e.inForceNow === true) return `: in force until ${day(e.validTo)}`;
  if (e.inForceNow === false) return `: not in force now (${day(e.validFrom)} to ${day(e.validTo)})`;
  return `: ${day(e.validFrom)} to ${day(e.validTo)}`;
}

export function LiveCard({ envelope }: { envelope: Envelope<LiveData> }) {
  const d = envelope.data;
  const faaSource = envelope.sources.find((s) => s.id === 'faa-nas-status');
  return (
    <Card
      title="Right now"
      envelope={envelope}
      aside={faaSource ? <span className="text-xs text-muted">FAA status fetched {timeAgo(faaSource.retrievedAt)}</span> : undefined}
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {d.airports.map((a) => (
          <li key={a.airport} className="rounded-xl border border-line px-3 py-2.5 text-sm">
            <div className="mb-1.5 font-semibold">
              {a.airport} <span className="font-normal text-muted">{a.name ?? ''}</span>
            </div>
            <div className="flex gap-2">
              <Radio aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-2" />
              <div>
                {a.faaEvents == null && <span className="text-muted">FAA status unavailable</span>}
                {a.faaEvents?.length === 0 && <span>No FAA delay programs, ground stops or closures listed</span>}
                {a.faaEvents?.map((e, i) =>
                  e.notamText ? (
                    <div key={`${e.category}-${i}`}>
                      <p>
                        <span className="font-semibold">{e.category}</span>
                        <span className="text-muted">{closureWindow(e)}</span>
                      </p>
                      <details className="mt-0.5">
                        <summary className="cursor-pointer text-xs text-muted hover:text-ink">NOTAM text</summary>
                        <p className="mt-1 font-mono text-xs leading-snug break-words text-muted">{e.notamText}</p>
                      </details>
                    </div>
                  ) : (
                    <p key={`${e.category}-${i}`}>
                      <span className="font-semibold">{e.category}</span>
                      {e.reason && <span className="text-muted">: {e.reason}</span>}
                      {e.avgDelay && <span className="text-muted">. Average delay {e.avgDelay}{e.maxDelay ? `, up to ${e.maxDelay}` : ''}</span>}
                    </p>
                  ),
                )}
              </div>
            </div>
            {a.weather && (
              <div className="mt-1.5 flex gap-2 text-muted">
                <CloudSun aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-3" />
                <span>
                  {FLIGHT_CATEGORY[a.weather.flightCategory ?? ''] ?? a.weather.flightCategory ?? 'Weather'}
                  {a.weather.windKt != null && `, wind ${a.weather.windKt} kt`}
                  {a.weather.observedAt && `, observed ${timeAgo(a.weather.observedAt)}`}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
