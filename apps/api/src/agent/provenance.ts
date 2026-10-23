// Checks that every number in an answer appears in the tool results (or the question).
// Used by the evaluation run; pure so it is unit-tested.

const NUMBER = /[-−]?\d[\d,]*(?:\.\d+)?/g;

/** Normalizes "1,234.50" -> "1234.5", "18.0" -> "18", unicode minus -> "-". */
export function normalizeNumber(raw: string): string {
  let n = raw.replace(/−/g, '-').replace(/,/g, '');
  if (n.includes('.')) n = n.replace(/0+$/, '').replace(/\.$/, '');
  if (n === '-0') n = '0';
  return n;
}

/** Names that contain a number but are not data: "the Lower 48" is a place. */
const NOT_DATA = [/\blower 48\b/gi];

export function numbersIn(text: string): string[] {
  const cleaned = NOT_DATA.reduce((t, re) => t.replace(re, ' '), text);
  return (cleaned.match(NUMBER) ?? []).map(normalizeNumber);
}

/** Small counts (list numbering, "12 months"), the score scale ("out of 100") and years are not data claims. */
function isIgnorable(n: string): boolean {
  const abs = n.replace(/^-/, '');
  if (!abs.includes('.')) {
    const v = Number(abs);
    if (v <= 12 || v === 100) return true;
    if (v >= 1990 && v <= 2100) return true;
  }
  return false;
}

/**
 * Returns the numbers in `answer` that appear nowhere in `evidence` (tool inputs, tool outputs and the
 * question). A sign may be dropped in prose ("fell 2.4%" for -2.4), so absolute values also match.
 */
export function unsupportedNumbers(answer: string, evidence: unknown[]): string[] {
  const known = new Set<string>();
  for (const e of evidence) {
    const text = typeof e === 'string' ? e : JSON.stringify(e);
    for (const n of numbersIn(text)) {
      known.add(n);
      known.add(n.replace(/^-/, ''));
    }
  }
  const out: string[] = [];
  for (const n of numbersIn(answer)) {
    if (isIgnorable(n)) continue;
    if (known.has(n) || known.has(n.replace(/^-/, ''))) continue;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}
