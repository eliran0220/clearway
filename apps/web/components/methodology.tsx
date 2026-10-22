'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { COMPONENT_COLOR } from './cards/ranking-card';

const COMPONENTS = [
  { key: 'growth', label: 'Demand growth', range: '-5% to +15%', weight: 35, what: 'Passengers in the last 12 months vs the 12 before' },
  { key: 'loadFactor', label: 'Seat occupancy', range: '70% to 95%', weight: 30, what: 'Passengers divided by seats' },
  { key: 'delay', label: 'Delay pressure', range: '0% to 35%', weight: 20, what: 'Arrivals 15+ minutes late' },
  { key: 'supplyGap', label: 'Supply gap', range: '0 to +5 pts', weight: 15, what: 'Passenger growth minus seat growth' },
];

const SOURCES = [
  { name: 'BTS T-100 summary by origin airport', how: 'API, refreshed daily', href: 'https://data.transportation.gov/d/r495-tyji' },
  { name: 'BTS T-100 Segment, all carriers', how: 'Official file, imported', href: 'https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FMG' },
  { name: 'BTS airline delay causes', how: 'Official file, imported', href: 'https://www.transtats.bts.gov/ot_delay/ot_delaycause1.asp' },
  { name: 'FAA airport status', how: 'Live API', href: 'https://nasstatus.faa.gov/' },
  { name: 'NOAA aviation weather', how: 'Live API', href: 'https://aviationweather.gov/' },
  { name: 'OurAirports', how: 'Reference file', href: 'https://ourairports.com/data/' },
];

export function Methodology({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus moves into the drawer, and back to whatever opened it when the drawer closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close methodology" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="methodology-title" className="relative h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 text-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="methodology-title" className="text-lg font-semibold">
            How Clearway answers
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-line p-1.5 text-muted hover:text-ink">
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <p className="mb-5 text-muted">
          Claude reads your question, picks an analysis and explains the result. Every number comes from code running on public data, never from the language model, and every answer
          lists its period, sources and assumptions.
        </p>

        <h3 className="mb-2 font-semibold">Expansion screening score</h3>
        <div className="mb-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {COMPONENTS.map((c) => (
            <span key={c.key} className={COMPONENT_COLOR[c.key]} style={{ width: `${c.weight}%` }} />
          ))}
        </div>
        <ul className="mb-3 space-y-2">
          {COMPONENTS.map((c) => (
            <li key={c.key} className="grid grid-cols-[0.75rem_1fr_auto] items-start gap-2">
              <span aria-hidden className={`mt-1 size-2.5 rounded-sm ${COMPONENT_COLOR[c.key]}`} />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-muted">
                  {c.what}. Scored from {c.range}.
                </span>
              </span>
              <span className="font-semibold">{c.weight}%</span>
            </li>
          ))}
        </ul>
        <p className="mb-5 text-muted">
          Fixed ranges keep an airport&apos;s score the same whichever airports it is compared with. Airports under 100,000 passengers a year, or with missing months, are listed but not
          scored. A high score means &quot;worth a terminal-capacity study&quot;, not a return on investment.
        </p>

        <h3 className="mb-2 font-semibold">Unmet demand</h3>
        <p className="mb-5 text-muted">
          No public data counts travelers who could not fly, so Clearway tests four signals instead: planes fuller than the national average for the same months, passengers growing faster
          than seats, strained operations (25% of arrivals delayed or a large system share of delays), and documented capacity limits.
        </p>

        <h3 className="mb-2 font-semibold">Long-haul share</h3>
        <p className="mb-5 text-muted">Departures flown at or over a distance threshold (4,000 km by default), counted by flights, not routes. You can change the threshold and include or exclude cargo.</p>

        <h3 className="mb-2 font-semibold">Data</h3>
        <ul className="space-y-1.5">
          {SOURCES.map((s) => (
            <li key={s.name} className="flex justify-between gap-3">
              <a href={s.href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                {s.name}
              </a>
              <span className="shrink-0 text-xs text-muted">{s.how}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
