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

export const pct = (n: number | null | undefined) => (n == null ? 'n/a' : `${n}%`);
export const signedPct = (n: number | null | undefined) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${n}%`);
export const pts = (n: number | null | undefined) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${n} pts`);

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
