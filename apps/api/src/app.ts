import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { METHODOLOGY_VERSION } from '@clearway/core';

// CORS is handled here only. The Lambda Function URL has CORS turned off (sst.config.ts),
// because setting it in both places sends duplicate headers and browsers reject them.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const app = new Hono();

app.use(
  '*',
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 600,
  }),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'clearway-api',
    methodology: METHODOLOGY_VERSION,
    time: new Date().toISOString(),
  }),
);

// The agent is wired in the next step (tools + Claude via the AI SDK).
app.post('/chat', (c) => c.json({ error: 'The agent is not wired yet.' }, 501));

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});
