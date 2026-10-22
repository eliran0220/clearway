// Talk to the agent from the terminal, with follow-ups, before the web app exists.
//   npm run ask                                  (interactive; type "exit" to quit)
//   npm run ask -- "Compare LA and Santa Ana congestion"
import readline from 'node:readline/promises';
import { generateText, type ModelMessage } from 'ai';
import { SYSTEM_PROMPT, model, stopAfterMaxSteps, tools } from './agent';

const history: ModelMessage[] = [];

async function ask(question: string) {
  history.push({ role: 'user', content: question });
  const started = Date.now();
  const result = await generateText({ model: model(), system: SYSTEM_PROMPT, messages: history, tools, stopWhen: stopAfterMaxSteps });
  for (const step of result.steps) {
    for (const call of step.toolCalls) console.log(`  -> ${call.toolName} ${JSON.stringify(call.input)}`);
  }
  console.log(`\n${result.text}\n`);
  const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s, ${result.steps.length} steps, ${usage?.inputTokens ?? '?'} in / ${usage?.outputTokens ?? '?'} out tokens)\n`);
  history.push(...result.response.messages);
}

const oneShot = process.argv.slice(2).join(' ').trim();
if (oneShot) {
  await ask(oneShot);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Clearway agent. Ask a question, follow up, or type "exit".\n');
  for (;;) {
    const q = (await rl.question('you> ')).trim();
    if (!q || q === 'exit' || q === 'quit') break;
    try {
      await ask(q);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      history.pop();
    }
  }
  rl.close();
}
