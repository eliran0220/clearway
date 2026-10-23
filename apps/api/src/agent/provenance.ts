// Checks that every number in an answer appears in the tool results (or the question).
// Used by the evaluation run; pure so it is unit-tested.

// Prose numbers may use thousands separators ("36,075"); only groups of exactly three digits count, so
// "3,000" is one number and "3000,5000" is two. Tool results are JSON, which can hold both prose in
// strings ("Under 1,500 km") and plain lists ("[3000,5000]"), so they are read both ways.
const PROSE_NUMBER = /[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const JSON_NUMBER = /-?\d+(?:\.\d+)?/g;

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
  return (cleaned.match(PROSE_NUMBER) ?? []).map(normalizeNumber);
}

function numbersInJson(json: string): string[] {
  return (json.match(JSON_NUMBER) ?? []).map(normalizeNumber);
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
    // The question is prose; tool inputs and outputs are JSON, read as prose and as JSON values.
    const json = typeof e === 'string' ? null : JSON.stringify(e);
    const found = json == null ? numbersIn(e as string) : [...numbersIn(json), ...numbersInJson(json)];
    for (const n of found) {
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
