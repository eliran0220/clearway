export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-04' -> 'Apr 2026' */
export function monthLabel(month: string | null | undefined): string {
  if (!month) return '';
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1];
  return name && y ? `${name} ${y}` : month;
}

export function periodLabel(period: { start: string; end: string } | null): string {
  return period ? `${monthLabel(period.start)} to ${monthLabel(period.end)}` : 'Current';
}

export const int = (n: number | null | undefined) => (n == null ? 'n/a' : Math.round(n).toLocaleString('en-US'));

/** 2147010 -> '2.1M', 87319 -> '87K' */
export function compact(n: number | null | undefined): string {
  if (n == null) return 'n/a';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

/**
 * Numbers for display, with a true minus sign (−) rather than a hyphen for negatives. `digits` fixes
 * the decimals, so a column reads 5.0 beside 2.6 instead of 5 beside 2.6.
 */
export const num = (n: number, digits?: number) => (digits == null ? String(n) : n.toFixed(digits)).replace('-', '\u2212');

/** The decimals a column of numbers needs: the most any value has, at most 2. */
export function columnDecimals(values: (number | null | undefined)[]): number {
  const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
  return Math.min(2, Math.max(0, ...values.filter((v): v is number => v != null).map(decimals)));
}

export const pct = (n: number | null | undefined, digits?: number) => (n == null ? 'n/a' : `${num(n, digits)}%`);
/** Formats a column of percentages with the same number of decimals, so 18 sits as 18.0% beside 19.3%. */
export function alignedPcts(values: (number | null | undefined)[]): string[] {
  const digits = columnDecimals(values);
  return values.map((v) => pct(v, digits));
}

/** '2027-05-28T16:00:00Z' -> '28 May 2027' */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const signedPct = (n: number | null | undefined, digits?: number) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${num(n, digits)}%`);
export const pts = (n: number | null | undefined, digits?: number) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${num(n, digits)} pts`);

/** "JFK", "JFK and LGA", "JFK, LGA and EWR" */
export const listOf = (items: string[]) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const minutes = Math.round((Date.now() - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** First paragraph of an answer as plain text, for read-aloud. Tables and lists are skipped. */
export function speakable(markdown: string): string {
  const first = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('|') && !p.startsWith('-') && !p.startsWith('#'));
  return (first ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The answer's first paragraph (the direct answer) and the rest, so the result cards can sit between them. */
export function splitLead(text: string): [string, string] {
  const m = /\n\s*\n/.exec(text);
  return m ? [text.slice(0, m.index), text.slice(m.index + m[0].length)] : [text, ''];
}
