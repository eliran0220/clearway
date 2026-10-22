// Conversation hygiene before a conversation is sent to the model again. Pure, unit-tested.

const isReasoning = (part: unknown) => {
  const type = (part as { type?: unknown })?.type;
  return typeof type === 'string' && type.includes('reasoning');
};

/**
 * Drops reasoning (thinking) parts from earlier turns before a conversation is sent again.
 * Each thinking block is signed for the exact request that produced it, and the API rejects it
 * when replayed in a later request. The model does not need it: tool calls and results are kept.
 */
export function withoutReasoning<M extends { role: string; content: unknown }>(messages: M[]): M[] {
  return messages
    .map((m) => (Array.isArray(m.content) ? ({ ...m, content: (m.content as unknown[]).filter((p) => !isReasoning(p)) } as M) : m))
    .filter((m) => !(Array.isArray(m.content) && m.content.length === 0));
}

/** Same for UI messages coming from the web client. */
export function uiWithoutReasoning<M extends { parts?: unknown[] }>(messages: M[]): M[] {
  return messages.map((m) => (Array.isArray(m.parts) ? ({ ...m, parts: m.parts.filter((p) => !isReasoning(p)) } as M) : m));
}
