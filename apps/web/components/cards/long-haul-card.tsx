import type { Envelope, LongHaulData } from '@/lib/types';
import { int } from '@/lib/format';
import { Card } from '../card';

/** Used only if the API did not list its thresholds. */
const DEFAULT_THRESHOLDS = [3000, 4000, 5000];

/** Long-haul share as a ring. The controls ask the agent again, so every change is recomputed by the tool. */
export function LongHaulCard({ envelope, onAsk, busy }: { envelope: Envelope<LongHaulData>; onAsk: (text: string) => void; busy: boolean }) {
  const d = envelope.data;
  // The buttons are the current threshold plus the ones the tool offers, so the card and the agent agree.
  const thresholds = d.otherThresholdsKm ? [...new Set([...d.otherThresholdsKm, d.thresholdKm])].sort((a, b) => a - b) : DEFAULT_THRESHOLDS;
  const share = d.longHaulSharePct ?? 0;
  const deg = (share / 100) * 360;
  const otherScope = d.scope === 'all' ? 'passenger' : 'all';

  return (
    <Card title={`Long-haul share: ${d.airport} departures`} envelope={envelope}>
      <div className="mb-4 flex flex-wrap gap-2">
        <div role="group" aria-label="Long-haul threshold" className="flex rounded-lg bg-tint p-0.5">
          {thresholds.map((t) => {
            const active = t === d.thresholdKm;
            return (
              <button
                key={t}
                type="button"
                disabled={busy || active}
                aria-pressed={active}
                onClick={() => onAsk(`Now use ${t.toLocaleString('en-US')} km`)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${active ? 'bg-surface text-brand-1 shadow-sm' : 'text-muted hover:text-ink'} disabled:cursor-default`}
              >
                {t.toLocaleString('en-US')} km
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Service scope" className="flex rounded-lg bg-tint p-0.5">
          {(['all', 'passenger'] as const).map((s) => {
            const active = s === d.scope;
            return (
              <button
                key={s}
                type="button"
                disabled={busy || active}
                aria-pressed={active}
                onClick={() => onAsk(s === 'passenger' ? 'Only passenger flights' : 'Include all services, cargo too')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${active ? 'bg-surface text-brand-1 shadow-sm' : 'text-muted hover:text-ink'} disabled:cursor-default`}
              >
                {s === 'all' ? 'All services' : 'Passenger only'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div
          role="img"
          aria-label={`${d.longHaulSharePct ?? 'n/a'} percent of departures are long-haul`}
          className="grid size-40 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(var(--cw-brand-1) 0deg, var(--cw-brand-3) ${deg}deg, var(--cw-line) ${deg}deg 360deg)` }}
        >
          <div className="grid size-28 place-items-center rounded-full bg-surface text-center">
            <div>
              <div className="text-2xl font-bold">{d.longHaulSharePct ?? 'n/a'}%</div>
              <div className="text-xs text-muted">long-haul</div>
            </div>
          </div>
        </div>

        <div className="min-w-[14rem] flex-1 text-sm">
          <p className="mb-2 text-muted">
            {int(d.longHaulDepartures)} of {int(d.departuresWithDistance)} departures flew {d.thresholdKm.toLocaleString('en-US')} km ({d.thresholdMi.toLocaleString('en-US')} mi) or more.{' '}
            {d.scope === 'all' ? 'Passenger only' : 'All services'}: {otherScope === 'passenger' ? d.bothScopes.passengerOnlyPct : d.bothScopes.allServicesPct}%.
          </p>
          <ul className="mb-3 space-y-1">
            {d.bands.map((b) => (
              <li key={b.label} className="flex justify-between gap-4 border-b border-line py-1">
                <span className="text-muted">{b.label}</span>
                <span>
                  {int(b.departures)} <span className="text-muted">({b.sharePct ?? 'n/a'}%)</span>
                </span>
              </li>
            ))}
          </ul>
          {d.topLongHaulDestinations.length > 0 && (
            <>
              <h4 className="mb-1 text-xs text-muted">Busiest long-haul destinations</h4>
              <ul className="space-y-1">
                {d.topLongHaulDestinations.map((t) => (
                  <li key={t.code} className="flex justify-between gap-4">
                    <span>
                      <span className="font-semibold">{t.code}</span> <span className="text-muted">{t.name ?? ''}</span>
                    </span>
                    <span className="whitespace-nowrap text-muted">
                      {int(t.departures)} flights, {int(t.distanceKm)} km
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
