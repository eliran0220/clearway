// Checks on the public /chat request body, kept apart from the route so they are unit-tested.
// The client sends the whole conversation each time, so the limits apply to all of it.

export const CHAT_LIMITS = {
  maxMessages: 40,
  maxQuestionChars: 2000, // per user message
  maxBodyChars: 600_000, // the whole conversation, including earlier tool results (roughly 150k tokens)
} as const;

interface IncomingMessage {
  role?: unknown;
  parts?: unknown;
}

const textOf = (m: IncomingMessage) =>
  (Array.isArray(m.parts) ? m.parts : [])
    .map((p) => (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' ? String((p as { text?: unknown }).text ?? '') : ''))
    .join('');

export type ChatCheck<T> = { ok: true; messages: T[] } | { ok: false; status: 400 | 413; error: string };

/**
 * Validates a raw /chat body. Only user and assistant messages are accepted: a client must not be
 * able to add its own system instructions. The last message must be the user's question.
 */
export function checkChatBody<T>(raw: string): ChatCheck<T> {
  if (raw.length > CHAT_LIMITS.maxBodyChars) return { ok: false, status: 413, error: 'This conversation is too long. Start a new chat.' };
  let body: { messages?: unknown };
  try {
    body = JSON.parse(raw) as { messages?: unknown };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, status: 400, error: 'messages is required' };
  if (messages.length > CHAT_LIMITS.maxMessages) return { ok: false, status: 400, error: 'This conversation is too long. Start a new chat.' };
  const list = messages as IncomingMessage[];
  if (list.some((m) => !m || (m.role !== 'user' && m.role !== 'assistant'))) return { ok: false, status: 400, error: 'Only user and assistant messages are accepted.' };
  if (list.at(-1)?.role !== 'user') return { ok: false, status: 400, error: 'The last message must be a question.' };
  if (list.some((m) => m.role === 'user' && textOf(m).length > CHAT_LIMITS.maxQuestionChars)) {
    return { ok: false, status: 400, error: `Please keep questions under ${CHAT_LIMITS.maxQuestionChars} characters.` };
  }
  return { ok: true, messages: messages as T[] };
}
