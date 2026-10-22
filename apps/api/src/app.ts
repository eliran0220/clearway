import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from 'ai';
import { METHODOLOGY_VERSION } from '@clearway/core';
import { SYSTEM_PROMPT, model, stopAfterMaxSteps, tools } from './agent/agent';
import { allowRequest } from './rate-limit';

// CORS is handled here only. The Lambda Function URL has CORS turned off (sst.config.ts),
// because setting it in both places sends duplicate headers and browsers reject them.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const MAX_MESSAGE_CHARS = 2000;
const MAX_MESSAGES = 40;

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

const textOf = (m: UIMessage) =>
  (m.parts ?? [])
    .map((p) => {
      const part = p as { type: string; text?: string };
      return part.type === 'text' ? (part.text ?? '') : '';
    })
    .join('');

app.post('/chat', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allowRequest(ip)) return c.json({ error: 'Too many questions in a short time. Please wait a few minutes.' }, 429);

  let body: { messages?: UIMessage[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return c.json({ error: 'messages is required' }, 400);
  if (messages.length > MAX_MESSAGES) return c.json({ error: 'This conversation is too long. Start a new chat.' }, 400);
  const last = messages.at(-1) as UIMessage;
  if (textOf(last).length > MAX_MESSAGE_CHARS) return c.json({ error: `Please keep questions under ${MAX_MESSAGE_CHARS} characters.` }, 400);

  const result = streamText({
    model: model(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stopAfterMaxSteps,
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});
