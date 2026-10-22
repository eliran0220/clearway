// Sanity (smoke) test for a running Clearway: local dev servers or the deployed URLs.
// It checks the API answers, the data is loaded, CORS lets the web app in, and each exam
// question runs the right tool end to end through the real model.
//
//   npm run smoke                                   # local API on :8787, all checks
//   npm run smoke -- --api https://<lambda-url> --web https://<app>.vercel.app
//   npm run smoke -- --quick                        # health, data and CORS, plus one question
//
// Exit code 0 when every check passes, 1 otherwise. Each question costs one model call.
export {};

interface Check {
  name: string;
  run: () => Promise<string>; // returns a short detail on success, throws on failure
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const api = (flag('api') ?? 'http://localhost:8787').replace(/\/$/, '');
const web = flag('web')?.replace(/\/$/, '');
const origin = flag('origin') ?? web ?? 'http://localhost:3000';
const quick = args.includes('--quick');

const QUESTIONS = [
  { q: 'Which airports in New England are strong candidates for terminal expansion?', tool: 'rankExpansionCandidates' },
  { q: 'Compare LA and Santa Ana airport congestion levels.', tool: 'compareCongestion' },
  { q: 'What is the percentage of long haul flights out of Anchorage airport?', tool: 'getLongHaulShare' },
  { q: 'What is the unmet flight demand in SFO airport and why?', tool: 'assessDemandPressure' },
];

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(30_000) });
  assert(res.ok, `${path} returned ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Sends one question the way the web app does and reads the UI message stream (server-sent events). */
async function ask(question: string) {
  const res = await fetch(`${api}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ messages: [{ id: 'smoke-1', role: 'user', parts: [{ type: 'text', text: question }] }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  assert(res.ok, `/chat returned ${res.status}: ${body.slice(0, 200)}`);
  const events = body
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  const errors = events.filter((e) => e.type === 'error' || e.type === 'tool-output-error');
  const tools = new Map<string, string>(); // toolCallId -> toolName
  for (const e of events) if (typeof e.toolName === 'string' && typeof e.toolCallId === 'string') tools.set(e.toolCallId, e.toolName);
  const outputs = events
    .filter((e) => e.type === 'tool-output-available')
    .map((e) => ({ tool: tools.get(e.toolCallId as string) ?? '?', output: e.output as { sources?: unknown[]; methodology?: string } }));
  const text = events.filter((e) => e.type === 'text-delta').map((e) => String(e.delta ?? '')).join('');
  return { errors, outputs, text };
}

const checks: Check[] = [
  {
    name: 'API health',
    run: async () => {
      const h = await getJson('/health');
      assert(h.ok === true, 'health is not ok');
      return `methodology ${String(h.methodology)}`;
    },
  },
  {
    name: 'Data loaded',
    run: async () => {
      const m = (await getJson('/meta')) as { latest?: Record<string, string | null> };
      const latest = m.latest ?? {};
      for (const k of ['traffic', 'delays', 'routes']) assert(latest[k], `no ${k} data loaded`);
      return `traffic ${latest.traffic}, delays ${latest.delays}, routes ${latest.routes}`;
    },
  },
  {
    name: 'CORS lets the web app in',
    run: async () => {
      const res = await fetch(`${api}/chat`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
      const allowed = res.headers.get('access-control-allow-origin');
      assert(allowed === origin, `origin ${origin} not allowed (got ${allowed ?? 'no header'}); check ALLOWED_ORIGINS`);
      return origin;
    },
  },
  {
    name: 'Rejects an empty chat request',
    run: async () => {
      const res = await fetch(`${api}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert(res.status === 400, `expected 400, got ${res.status}`);
      return '400';
    },
  },
  ...(web
    ? [
        {
          name: 'Web page loads',
          run: async () => {
            const res = await fetch(web, { signal: AbortSignal.timeout(30_000) });
            assert(res.ok, `web returned ${res.status}`);
            assert((await res.text()).includes('Clearway'), 'page does not mention Clearway');
            return web;
          },
        },
      ]
    : []),
  ...(quick ? QUESTIONS.slice(0, 1) : QUESTIONS).map(({ q, tool }) => ({
    name: `Question: ${q}`,
    run: async () => {
      const r = await ask(q);
      if (r.errors.length) throw new Error(`stream error: ${JSON.stringify(r.errors[0]).slice(0, 200)}`);
      const hit = r.outputs.find((o) => o.tool === tool);
      assert(hit, `expected ${tool}, ran ${r.outputs.map((o) => o.tool).join(', ') || 'no tools'}`);
      assert(Array.isArray(hit.output.sources) && hit.output.sources.length > 0, `${tool} returned no sources`);
      assert(r.text.trim().length > 40, 'no answer text');
      return `${r.outputs.map((o) => o.tool).join(' → ')}; ${r.text.trim().split(/\s+/).length} words`;
    },
  })),
];

let failed = 0;
console.log(`Clearway smoke test: API ${api}${web ? `, web ${web}` : ''}\n`);
for (const c of checks) {
  const t0 = Date.now();
  try {
    const detail = await c.run();
    console.log(`  ok    ${c.name} (${((Date.now() - t0) / 1000).toFixed(1)} s): ${detail}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${c.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\n${checks.length - failed} of ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
