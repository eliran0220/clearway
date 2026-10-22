// Best-effort, per-instance rate limit for the public chat endpoint. Each Lambda instance keeps its
// own counters, so this slows down abuse rather than enforcing an exact quota; the hard cap is the
// monthly spend limit on the Anthropic workspace.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const hits = new Map<string, number[]>();

export function allowRequest(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}

export const RATE_LIMIT = { windowMinutes: WINDOW_MS / 60_000, maxRequests: MAX_REQUESTS };
