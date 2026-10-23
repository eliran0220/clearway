'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, TriangleAlert } from 'lucide-react';
import type { Envelope, SourceKind } from '@/lib/types';
import { periodLabel, timeAgo } from '@/lib/format';

const KIND_LABEL: Record<SourceKind, string> = {
  'live-api': 'Live API',
  'cached-api': 'API, refreshed daily',
  file: 'File, imported',
  curated: 'Curated source',
};

const KIND_STYLE: Record<SourceKind, string> = {
  'live-api': 'bg-good-bg text-good',
  'cached-api': 'bg-tint text-brand-2',
  file: 'bg-tint text-muted',
  curated: 'bg-watch-bg text-watch',
};

const CONFIDENCE_STYLE = {
  high: 'bg-good-bg text-good',
  medium: 'bg-watch-bg text-watch',
  low: 'bg-critical-bg text-critical',
} as const;

/** Period, confidence, sources, assumptions and warnings for one tool result. */
export function Evidence({ envelope }: { envelope: Envelope<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-line pt-3 text-[13px]">
      {envelope.warnings.length > 0 && (
        <ul className="mb-2 space-y-1">
          {envelope.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-watch">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-muted hover:text-ink"
      >
        <span className="font-semibold text-ink">Evidence</span>
        <span>{periodLabel(envelope.period)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_STYLE[envelope.confidence]}`}>{envelope.confidence} confidence</span>
        <span>
          {envelope.sources.length} {envelope.sources.length === 1 ? 'source' : 'sources'}
        </span>
        <ChevronDown aria-hidden className={`ml-auto size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1.5 font-semibold">Sources</h4>
            <ul className="space-y-2">
              {envelope.sources.map((s) => (
                <li key={s.id} className="flex flex-col gap-0.5">
                  <span className="flex items-start gap-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${KIND_STYLE[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                        {s.label}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : (
                      <span>{s.label}</span>
                    )}
                  </span>
                  <span className="pl-1 text-xs text-muted">
                    {s.kind === 'curated' ? `As of ${s.retrievedAt}` : `Retrieved ${timeAgo(s.retrievedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1.5 font-semibold">Assumptions</h4>
            <ul className="list-disc space-y-1 pl-4 text-muted">
              {envelope.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Method {envelope.methodology}</p>
          </div>
        </div>
      )}
    </div>
  );
}
