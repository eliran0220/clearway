// Evaluation run: the four exam questions, follow-ups and an out-of-scope question against the real
// data and the real model. A turn fails if the expected tool or argument is missing, or if the answer
// states a number that appears in no tool result.
//   npm run eval                 (all scenarios)
//   npm run eval -- anchorage    (scenarios whose name contains "anchorage")
//   npm run eval -- --verbose    (print every answer)
import { generateText, type ModelMessage } from 'ai';
import { model, stopAfterMaxSteps, systemPrompt, tools, withoutReasoning } from './agent';
import { unsupportedNumbers } from './provenance';

interface Call {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
}
interface Turn {
  question: string;
  expect: (calls: Call[], answer: string) => string[];
}
interface Scenario {
  name: string;
  turns: Turn[];
}

const calledWith = (calls: Call[], name: string) => calls.filter((c) => c.toolName === name);

const scenarios: Scenario[] = [
  {
    name: 'New England expansion candidates, then less weight on delays',
    turns: [
      {
        question: 'Which airports in New England are strong candidates for terminal expansion?',
        expect: (calls) => (calledWith(calls, 'rankExpansionCandidates').length ? [] : ['rankExpansionCandidates was not called']),
      },
      {
        question: 'Put less weight on delays',
        expect: (calls) => {
          const last = calledWith(calls, 'rankExpansionCandidates').at(-1);
          if (!last) return ['the ranking was not recomputed'];
          const w = (last.input.weights ?? {}) as Record<string, unknown>;
          return typeof w.delay === 'number' && w.delay < 0.2 ? [] : [`expected weights.delay below 0.20, got ${JSON.stringify(last.input.weights)}`];
        },
      },
    ],
  },
  {
    name: 'LA vs Santa Ana congestion',
    turns: [
      {
        question: 'Compare LA and Santa Ana airport congestion levels.',
        expect: (calls) => {
          const codes = (calledWith(calls, 'compareCongestion').at(-1)?.input.airports as string[] | undefined) ?? [];
          return codes.includes('LAX') && codes.includes('SNA') ? [] : [`expected compareCongestion with LAX and SNA, got ${JSON.stringify(codes)}`];
        },
      },
    ],
  },
  {
    name: 'Anchorage long-haul, then 5,000 km, then passenger only',
    turns: [
      {
        question: 'What is the percentage of long-haul flights out of Anchorage airport?',
        expect: (calls) => (calledWith(calls, 'getLongHaulShare').some((c) => c.input.airport === 'ANC') ? [] : ['getLongHaulShare for ANC was not called']),
      },
      {
        question: 'Now use 5,000 km',
        expect: (calls) => (calledWith(calls, 'getLongHaulShare').some((c) => c.input.thresholdKm === 5000) ? [] : ['expected getLongHaulShare with thresholdKm 5000']),
      },
      {
        question: 'Only passenger flights',
        expect: (calls) => (calledWith(calls, 'getLongHaulShare').some((c) => c.input.scope === 'passenger') ? [] : ['expected getLongHaulShare with scope "passenger"']),
      },
    ],
  },
  {
    name: 'SFO unmet demand',
    turns: [
      {
        question: 'What is the unmet flight demand at SFO and why?',
        expect: (calls) => (calledWith(calls, 'assessDemandPressure').some((c) => c.input.airport === 'SFO') ? [] : ['assessDemandPressure for SFO was not called']),
      },
    ],
  },
  {
    name: 'Out of scope: ROI',
    turns: [
      {
        question: 'What return on investment would a new terminal at Boston Logan earn?',
        expect: (_calls, answer) => (/out of scope|cannot|can't|can not|not able|no data|doesn't|does not/i.test(answer) ? [] : ['expected the answer to say ROI is outside what the data can show']),
      },
    ],
  },
];

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filter = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase();
const indent = (text: string) => text.split('\n').map((l) => `      ${l}`).join('\n');

let failed = 0;
let turnsRun = 0;
const started = Date.now();

for (const scenario of scenarios.filter((s) => !filter || s.name.toLowerCase().includes(filter))) {
  console.log(`\n=== ${scenario.name}`);
  let history: ModelMessage[] = [];
  const evidence: unknown[] = [];
  for (const turn of scenario.turns) {
    turnsRun++;
    const messages: ModelMessage[] = [...history, { role: 'user', content: turn.question }];
    const result = await generateText({ model: model(), system: systemPrompt(), messages, tools, stopWhen: stopAfterMaxSteps });
    const calls: Call[] = result.steps.flatMap((step) =>
      step.toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: (tc.input ?? {}) as Record<string, unknown>,
        output: (step.toolResults as unknown as { toolCallId: string; output: unknown }[]).find((tr) => tr.toolCallId === tc.toolCallId)?.output,
      })),
    );
    // Numbers may come from this turn's tools, earlier turns' tools, or the questions themselves.
    evidence.push(turn.question, ...calls.map((c) => c.input), ...calls.map((c) => c.output));
    const problems = [
      ...turn.expect(calls, result.text),
      ...unsupportedNumbers(result.text, evidence).map((n) => `number not found in any tool result: ${n}`),
    ];
    console.log(`  you> ${turn.question}`);
    for (const c of calls) console.log(`    -> ${c.toolName} ${JSON.stringify(c.input)}`);
    if (problems.length) {
      failed++;
      console.log('  FAIL');
      for (const p of problems) console.log(`    - ${p}`);
    } else {
      console.log('  PASS');
    }
    if (verbose || problems.length) console.log(indent(result.text));
    history = withoutReasoning([...messages, ...result.response.messages]);
  }
}

console.log(`\n${turnsRun - failed} of ${turnsRun} turns passed in ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
