import type { ReactNode } from 'react';
import type { Envelope } from '@/lib/types';
import { Evidence } from './evidence';

/** Frame for one tool result: a title, the content, and its evidence footer. */
export function Card({ title, aside, envelope, children }: { title: string; aside?: ReactNode; envelope: Envelope<unknown>; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {aside}
      </header>
      {children}
      <Evidence envelope={envelope} />
    </section>
  );
}
