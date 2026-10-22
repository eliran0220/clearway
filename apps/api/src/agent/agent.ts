// Shared agent setup for the HTTP route and the terminal client.
import { anthropic } from '@ai-sdk/anthropic';
import { createDb, type Db } from '@clearway/db';
import { createTools } from './tools';

export { SYSTEM_PROMPT } from './prompt';

/** At most this many model steps per user turn (each step may call tools). */
export const MAX_STEPS = 6;

let db: Db | undefined;
export const getDb = () => (db ??= createDb());

export const tools = createTools(getDb);

export const model = () => anthropic(process.env.MODEL_ID ?? 'claude-sonnet-5-5');

/**
 * Stop condition written as a plain function, so it does not depend on a helper whose name
 * changed between AI SDK versions (stepCountIs / isStepCount).
 */
export const stopAfterMaxSteps = ({ steps }: { steps: readonly unknown[] }) => steps.length >= MAX_STEPS;
