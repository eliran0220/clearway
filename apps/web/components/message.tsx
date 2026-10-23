'use client';

import type { UIMessage } from 'ai';
import { Check, CircleAlert, LoaderCircle, Volume2 } from 'lucide-react';
import type { CongestionData, Envelope, LiveData, LongHaulData, MetricsData, PressureData, RankingData, ToolPart } from '@/lib/types';
import { isToolPart, toolNameOf } from '@/lib/types';
import { splitLead } from '@/lib/format';
import { AnswerText } from './markdown';
import { CongestionCard } from './cards/congestion-card';
import { LiveCard } from './cards/live-card';
import { LongHaulCard } from './cards/long-haul-card';
import { MetricsCard } from './cards/metrics-card';
import { PressureCard } from './cards/pressure-card';
import { RankingCard } from './cards/ranking-card';

const RUNNING: Record<string, string> = {
  resolveAirports: 'Finding airports',
  getAirportMetrics: 'Pulling traffic',
  rankExpansionCandidates: 'Scoring airports',
  compareCongestion: 'Comparing delays',
  getLongHaulShare: 'Counting departures by distance',
  assessDemandPressure: 'Checking demand signals',
  getLiveConditions: 'Checking FAA status and weather',
};

function doneLabel(name: string, part: ToolPart): string {
  const input = part.input ?? {};
  const out = (part.output as Envelope<Record<string, unknown>> | undefined)?.data;
  switch (name) {
    case 'resolveAirports': {
      const region = out?.region as { label?: string } | null | undefined;
      const airports = (out?.airports as { code: string }[] | undefined) ?? [];
      if (region?.label) return `${region.label}: ${airports.length} airports`;
      return airports.length ? `Found ${airports.map((a) => a.code).join(', ')}` : `No match for "${String(input.query ?? '')}"`;
    }
    case 'rankExpansionCandidates': {
      const counts = out?.counts as { ranked: number; checked: number } | undefined;
      return counts ? `Scored ${counts.ranked} of ${counts.checked} airports` : 'Scored airports';
    }
    case 'getLongHaulShare':
      return `Counted ${String(input.airport ?? '')} ${input.scope === 'passenger' ? 'passenger ' : ''}departures at ${Number(input.thresholdKm ?? 4000).toLocaleString('en-US')} km`;
    case 'compareCongestion':
      return `Compared ${((input.airports as string[] | undefined) ?? []).join(' and ')}`;
    case 'assessDemandPressure':
      return `Checked demand signals at ${String(input.airport ?? '')}`;
    case 'getAirportMetrics':
      return `Pulled traffic for ${((input.airports as string[] | undefined) ?? []).join(', ')}`;
    case 'getLiveConditions':
      return 'Checked FAA status and weather';
    default:
      return name;
  }
}

interface Step {
  key: string;
  state: 'running' | 'done' | 'failed' | 'empty'; // empty: an airport lookup that found nothing
  label: string;
  title?: string;
  codes?: string[]; // set on airport lookups that can merge with the next one
}

const listCodes = (codes: string[]) => (codes.length <= 2 ? codes.join(' and ') : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`);

/**
 * One step per tool call, except that back-to-back airport lookups read as a single "Found LAX and SNA",
 * and a lookup that found nothing is dropped once a later lookup succeeds (the agent retried).
 */
function stepsOf(parts: ToolPart[]): Step[] {
  const steps: Step[] = [];
  for (const p of parts) {
    const name = toolNameOf(p);
    const state = p.state === 'output-error' ? 'failed' : p.state === 'output-available' ? 'done' : 'running';
    if (name === 'resolveAirports' && state === 'done') {
      const out = (p.output as Envelope<{ region?: { label?: string } | null; airports?: { code: string }[] }> | undefined)?.data;
      const codes = (out?.airports ?? []).map((a) => a.code);
      if (!out?.region?.label && codes.length === 0) {
        steps.push({ key: p.toolCallId, state: 'empty', label: doneLabel(name, p) });
        continue;
      }
      if (!out?.region?.label) {
        while (steps.at(-1)?.state === 'empty') steps.pop();
        const prev = steps.at(-1);
        if (prev?.codes) {
          prev.codes = [...new Set([...prev.codes, ...codes])];
          prev.label = `Found ${listCodes(prev.codes)}`;
          continue;
        }
        steps.push({ key: p.toolCallId, state, label: `Found ${listCodes(codes)}`, codes });
        continue;
      }
    }
    steps.push({
      key: p.toolCallId,
      state,
      label: state === 'running' ? (RUNNING[name] ?? name) : state === 'failed' ? `${RUNNING[name] ?? name} failed` : doneLabel(name, p),
      title: state === 'failed' ? p.errorText : undefined,
    });
  }
  return steps;
}

/** The steps the agent took for this answer, as a compact trail. */
function ToolTrail({ parts }: { parts: ToolPart[] }) {
  if (parts.length === 0) return null;
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5" aria-label="Steps the agent took">
      {stepsOf(parts).map((s) => (
        <li
          key={s.key}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${s.state === 'failed' ? 'border-critical/30 bg-critical-bg text-critical' : 'border-line bg-surface text-muted'}`}
          title={s.title}
        >
          {s.state === 'running' && <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />}
          {s.state === 'done' && <Check aria-hidden className="size-3.5 text-good" />}
          {s.state === 'failed' && <CircleAlert aria-hidden className="size-3.5" />}
          {s.state === 'empty' && <CircleAlert aria-hidden className="size-3.5 text-watch" />}
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ResultCard({ part, onAsk, busy }: { part: ToolPart; onAsk: (text: string) => void; busy: boolean }) {
  if (part.state !== 'output-available' || !part.output) return null;
  const name = toolNameOf(part);
  switch (name) {
    case 'rankExpansionCandidates':
      return <RankingCard envelope={part.output as Envelope<RankingData>} />;
    case 'compareCongestion':
      return <CongestionCard envelope={part.output as Envelope<CongestionData>} />;
    case 'getLongHaulShare':
      return <LongHaulCard envelope={part.output as Envelope<LongHaulData>} onAsk={onAsk} busy={busy} />;
    case 'assessDemandPressure':
      return <PressureCard envelope={part.output as Envelope<PressureData>} />;
    case 'getAirportMetrics':
      return <MetricsCard envelope={part.output as Envelope<MetricsData>} />;
    case 'getLiveConditions':
      return <LiveCard envelope={part.output as Envelope<LiveData>} />;
    default:
      return null; // resolveAirports shows in the trail only
  }
}

const textsIn = (parts: UIMessage['parts']) => parts.flatMap((p) => (p.type === 'text' && (p as { text: string }).text.trim() ? [(p as { text: string }).text] : []));

/** A user message's text. */
export const textOf = (m: UIMessage) => textsIn(m.parts).join('').trim();

/**
 * An answer is the text written after the last tool call. Text the model writes between calls
 * ("that lookup failed, trying again") is working narration, so it is not shown. A run that ends
 * on a tool call (the step limit) has only that earlier text, so it is shown, paragraphs kept apart.
 */
export function answerOf(m: UIMessage, streaming = false): string {
  let lastTool = -1;
  m.parts.forEach((p, i) => {
    if (isToolPart(p as { type: string })) lastTool = i;
  });
  const final = textsIn(m.parts.slice(lastTool + 1)).join('').trim();
  if (final || streaming) return final;
  return textsIn(m.parts)
    .map((t) => t.trim())
    .join('\n\n');
}

export function Message({ message, streaming, busy, onAsk, onSpeak }: { message: UIMessage; streaming: boolean; busy: boolean; onAsk: (text: string) => void; onSpeak: (text: string) => void }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p dir="auto" className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-1 px-4 py-2.5 text-[15px] text-white sm:max-w-[75%]">{textOf(message)}</p>
      </div>
    );
  }

  const toolParts = message.parts.filter((p) => isToolPart(p as { type: string })) as unknown as ToolPart[];
  const text = answerOf(message, streaming);
  const [lead, rest] = splitLead(text);
  const thinking = streaming && !text && toolParts.every((p) => p.state === 'output-available');

  return (
    <article className="space-y-4" aria-busy={streaming}>
      <div>
        <ToolTrail parts={toolParts} />
        {thinking && (
          <p className="flex items-center gap-1 text-sm text-muted" aria-live="polite">
            Working on it
            <span className="thinking-dot">.</span>
            <span className="thinking-dot [animation-delay:0.2s]">.</span>
            <span className="thinking-dot [animation-delay:0.4s]">.</span>
          </p>
        )}
        {lead && (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <AnswerText text={lead} />
            </div>
            {!streaming && (
              <button
                type="button"
                onClick={() => onSpeak(text)}
                aria-label="Read this answer aloud"
                className="shrink-0 rounded-lg border border-line p-2 text-brand-2 hover:bg-tint"
              >
                <Volume2 aria-hidden className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {/* Direct answer first, then the result cards, then the explanation. */}
      {toolParts.map((p) => (
        <ResultCard key={p.toolCallId} part={p} onAsk={onAsk} busy={busy} />
      ))}
      {rest && (
        <div className="pr-0 sm:pr-11">
          <AnswerText text={rest} />
        </div>
      )}
    </article>
  );
}
