// Shared agent setup for the HTTP route, the terminal client and the evaluation run.
import { anthropic } from '@ai-sdk/anthropic';
import { createDb, type Db } from '@clearway/db';
import { SYSTEM_PROMPT } from './prompt';
import { createTools } from './tools';

export { uiWithoutReasoning, withoutReasoning } from './messages';

/** At most this many model steps per user turn (each step may call tools). */
export const MAX_STEPS = 6;

let db: Db | undefined;
export const getDb = () => (db ??= createDb());

export const tools = createTools(getDb);

export const model = () => anthropic(process.env.MODEL_ID ?? 'claude-sonnet-5-5');

/** The system prompt with today's date, so the model can judge whether a live notice is current. */
export const systemPrompt = (now = new Date()) => `${SYSTEM_PROMPT}\n\nToday's date is ${now.toISOString().slice(0, 10)} (UTC).`;

/**
 * Stop condition written as a plain function, so it does not depend on a helper whose name
 * changed between AI SDK versions (stepCountIs / isStepCount).
 */
export const stopAfterMaxSteps = ({ steps }: { steps: readonly unknown[] }) => steps.length >= MAX_STEPS;
