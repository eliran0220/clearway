'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ArrowUp, BookOpen, Mic, Plus, Square, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { API_URL, monthLabel, speakable } from '@/lib/format';
import { isToolPart, toolNameOf, type ToolPart } from '@/lib/types';
import { useVoice } from '@/lib/use-voice';
import { answerOf, Message } from './message';
import { LogoMark } from './logo';
import { Methodology } from './methodology';

const QUESTIONS = [
  { text: 'Which airports in New England are strong candidates for terminal expansion?', hint: 'Ranks airports with the screening score' },
  { text: 'Compare LA and Santa Ana airport congestion levels.', hint: 'Delays, causes and live FAA status' },
  { text: 'What is the percentage of long-haul flights out of Anchorage airport?', hint: 'Flights by distance, threshold you can change' },
  { text: 'What is the unmet flight demand at SFO and why?', hint: 'Demand signals, capacity limits and what the data cannot show' },
];

const FOLLOW_UPS: Record<string, string[]> = {
  rankExpansionCandidates: ['Put less weight on delays', 'Only airports above 1 million passengers', 'Why is the first airport ahead of the second?'],
  compareCongestion: ['How busy are they, and are they growing?', 'Add SFO to the comparison'],
  getLongHaulShare: ['Now use 5,000 km', 'Only passenger flights'],
  assessDemandPressure: ['Compare its congestion with LAX', 'How has its traffic grown?'],
  getAirportMetrics: ['Rank New England airports for expansion'],
};

/** The API answers refusals as JSON ({"error": "..."}); show its sentence, not the raw body. */
function errorText(error: Error): string {
  const raw = error.message ?? '';
  try {
    const body = JSON.parse(raw) as { error?: unknown };
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // not JSON: a network or stream error, shown as it is
  }
  return raw || 'The connection to Clearway failed. Check your connection and try again.';
}

export function Chat() {
  const transport = useMemo(() => new DefaultChatTransport({ api: `${API_URL}/chat` }), []);
  const { messages, sendMessage, status, stop, error, setMessages, regenerate } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const closeMethodology = useCallback(() => setMethodologyOpen(false), []);
  const [dataThrough, setDataThrough] = useState<string | null>(null);
  const voiceTurn = useRef(false);
  const following = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';

  const ask = (text: string, viaVoice = false) => {
    const question = text.trim();
    if (!question || busy) return;
    voiceTurn.current = viaVoice;
    following.current = true;
    voice.stopSpeaking();
    void sendMessage({ text: question });
    setDraft('');
  };

  const voice = useVoice((text) => ask(text, true));

  // When a question came by voice, read the first paragraph of the answer aloud.
  useEffect(() => {
    if (status !== 'ready' || !voiceTurn.current) return;
    voiceTurn.current = false;
    const last = messages.at(-1);
    if (last?.role === 'assistant') voice.speak(speakable(answerOf(last)));
  }, [status, messages, voice]);

  // Follow the answer as it streams, but only while the reader is at the bottom: scrolling up to read
  // an earlier card stops the follow, and asking a new question turns it back on.
  useEffect(() => {
    const onScroll = () => {
      following.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (following.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  useEffect(() => {
    fetch(`${API_URL}/meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { latest?: { traffic?: string | null } } | null) => setDataThrough(d?.latest?.traffic ?? null))
      .catch(() => setDataThrough(null));
  }, []);

  const followUps = useMemo(() => {
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant' || busy) return [];
    const toolParts = last.parts.filter((p) => isToolPart(p as { type: string })) as unknown as ToolPart[];
    const names = toolParts.map(toolNameOf);
    return [...new Set(names.flatMap((n) => FOLLOW_UPS[n] ?? []))].slice(0, 3);
  }, [messages, busy]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(draft);
    }
  };

  const newChat = () => {
    void stop();
    voice.stopSpeaking();
    setMessages([]);
    setDraft('');
  };

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-9 shrink-0" />
            <span className="leading-tight">
              <span className="block text-[17px] font-bold tracking-tight">Clearway</span>
              <span className="block text-xs text-muted">Airport investment screening</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {dataThrough && <span className="hidden text-xs text-muted sm:inline">Traffic data through {monthLabel(dataThrough)}</span>}
            <button type="button" onClick={() => setMethodologyOpen(true)} aria-label="Methodology" className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium hover:bg-tint">
              <BookOpen aria-hidden className="size-4" />
              <span className="hidden sm:inline">Methodology</span>
            </button>
            {!empty && (
              <button type="button" onClick={newChat} aria-label="New chat" className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium hover:bg-tint">
                <Plus aria-hidden className="size-4" />
                <span className="hidden sm:inline">New chat</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-8">
        {empty ? (
          <section className="my-auto py-6">
            {/* my-auto centers the block between the header and the question box. */}
            <h1 className="mx-auto max-w-2xl text-balance text-center text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Where should the next terminal investment go?</h1>
            <p className="mx-auto mt-3 max-w-xl text-balance text-center text-[15px] text-muted">
              Ask about passenger growth, congestion, long-haul flights or demand pressure at US airports. Answers come from BTS and FAA data and show their sources and limits.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {QUESTIONS.map((q) => (
                <li key={q.text}>
                  <button
                    type="button"
                    onClick={() => ask(q.text)}
                    className="h-full w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-brand-2/50 hover:bg-tint"
                  >
                    <span className="block text-[15px] font-medium leading-snug">{q.text}</span>
                    <span className="mt-1.5 block text-xs text-muted">{q.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center text-xs text-muted">Clearway screens airports for further study. It does not estimate returns, construction costs or approvals.</p>
          </section>
        ) : (
          <div className="space-y-8">
            {messages.map((m, i) => (
              <Message
                key={m.id}
                message={m}
                streaming={busy && i === messages.length - 1}
                busy={busy}
                onAsk={(t) => ask(t)}
                onSpeak={(t) => voice.speak(speakable(t))}
              />
            ))}
            {status === 'submitted' && messages.at(-1)?.role === 'user' && (
              <p className="flex items-center gap-1 text-sm text-muted" aria-live="polite">
                Reading the question
                <span className="thinking-dot">.</span>
                <span className="thinking-dot [animation-delay:0.2s]">.</span>
                <span className="thinking-dot [animation-delay:0.4s]">.</span>
              </p>
            )}
            {error && (
              <div role="alert" className="rounded-xl border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical">
                <p className="font-semibold">Clearway couldn't answer that.</p>
                <p className="mt-0.5">{errorText(error)}</p>
                <button type="button" onClick={() => void regenerate()} className="mt-2 rounded-lg border border-critical/40 px-3 py-1 font-medium">
                  Try again
                </button>
              </div>
            )}
            {followUps.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Suggested follow-ups">
                {followUps.map((f) => (
                  <li key={f}>
                    <button type="button" onClick={() => ask(f)} className="rounded-full border border-brand-2/30 bg-surface px-3 py-1.5 text-sm text-brand-2 hover:bg-tint">
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <div className="sticky bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {voice.speaking && (
            <div className="mb-2 flex items-center gap-2 text-sm text-brand-2" aria-live="polite">
              Reading the answer aloud
              <button type="button" onClick={voice.stopSpeaking} className="flex items-center gap-1 rounded-full border border-brand-2/30 px-2 py-0.5 text-xs font-medium">
                <VolumeX aria-hidden className="size-3.5" />
                Stop
              </button>
            </div>
          )}
          <form onSubmit={onSubmit} className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-sm focus-within:border-brand-2 focus-within:ring-4 focus-within:ring-brand-2/10">
            <label htmlFor="question" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="question"
              dir="auto"
              rows={1}
              value={voice.listening ? voice.interim : draft}
              readOnly={voice.listening}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={2000}
              placeholder={voice.listening ? 'Listening...' : 'Ask about any US airport'}
              className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted"
            />
            {voice.supported && (
              <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                disabled={busy && !voice.listening}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop listening' : 'Ask by voice'}
                className={`grid size-10 shrink-0 place-items-center rounded-full border ${
                  voice.listening ? 'listening-pulse border-brand-2 bg-brand-2 text-white' : 'border-line text-brand-1 hover:bg-tint'
                } disabled:opacity-40`}
              >
                <Mic aria-hidden className="size-5" />
              </button>
            )}
            {busy ? (
              <button type="button" onClick={() => void stop()} aria-label="Stop the answer" className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-surface">
                <Square aria-hidden className="size-4" />
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim()} aria-label="Send question" className="horizon grid size-10 shrink-0 place-items-center rounded-full text-white disabled:opacity-40">
                <ArrowUp aria-hidden className="size-5" />
              </button>
            )}
          </form>
          <p className="mt-1.5 px-4 text-xs text-muted" aria-live="polite">
            {voice.error ??
              (voice.listening
                ? 'Speak your question. Tap the mic again to finish; the answer will be read aloud.'
                : voice.supported
                  ? 'Press Enter to send, or tap the mic to ask by voice.'
                  : 'Press Enter to send. Voice input works in Chrome, Edge and Safari.')}
          </p>
        </div>
      </div>

      <Methodology open={methodologyOpen} onClose={closeMethodology} />
    </div>
  );
}
