import { describe, it, expect } from 'vitest';
import { normalizeNumber, numbersIn, unsupportedNumbers } from '../src/agent/provenance';
import { uiWithoutReasoning, withoutReasoning } from '../src/agent/messages';

describe('number provenance', () => {
  it('normalizes commas, trailing zeros and the unicode minus', () => {
    expect(normalizeNumber('1,234.50')).toBe('1234.5');
    expect(normalizeNumber('18.0')).toBe('18');
    expect(normalizeNumber('−2.4')).toBe('-2.4');
    expect(numbersIn('LAX 19.3% vs SNA 18%, 270,853 departures')).toEqual(['19.3', '18', '270853']);
  });

  it('accepts numbers present in tool results, with or without a sign, and ignores small counts and years', () => {
    const evidence = [{ delayRatePct: 19.3, other: 18, departures12m: 270853, growth: -2.4 }];
    const answer = 'In the 12 months to 2026, LAX was 19.3% vs 18%, with 270,853 departures; growth fell 2.4%.';
    expect(unsupportedNumbers(answer, evidence)).toEqual([]);
  });

  it('flags a number the model made up', () => {
    expect(unsupportedNumbers('About 37.5% of flights are long-haul.', [{ longHaulSharePct: 41.3 }])).toEqual(['37.5']);
  });

  it('counts the question as evidence (for example a threshold the user typed)', () => {
    expect(unsupportedNumbers('Using 5,000 km, the share is 26.4%.', ['Now use 5,000 km', { longHaulSharePct: 26.4 }])).toEqual([]);
  });
});

describe('dropping replayed reasoning', () => {
  it('removes reasoning parts and keeps text, tool calls and tool results', () => {
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'x' }, { type: 'tool-call', toolName: 'a' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolName: 'a' }] },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'only thinking' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
    ];
    const out = withoutReasoning(messages);
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect((out[1]?.content as { type: string }[]).map((p) => p.type)).toEqual(['tool-call']);
  });

  it('removes reasoning parts from UI messages', () => {
    const out = uiWithoutReasoning([{ id: '1', parts: [{ type: 'reasoning' }, { type: 'text' }, { type: 'tool-getLongHaulShare' }] }]);
    expect(out[0]?.parts?.map((p) => (p as { type: string }).type)).toEqual(['text', 'tool-getLongHaulShare']);
  });
});

describe('names that contain numbers', () => {
  it('does not treat "the Lower 48" as a data claim', () => {
    expect(unsupportedNumbers('US hubs in the Lower 48, 156 departures', [{ departures: 156 }])).toEqual([]);
    expect(unsupportedNumbers('48 departures', [{ departures: 156 }])).toEqual(['48']);
  });
});

describe('lists of numbers in tool results', () => {
  it('reads [3000,5000] as two numbers, so "3,000 km" is supported', () => {
    expect(unsupportedNumbers('I can re-run at 3,000 km or 5,000 km.', [{ otherThresholdsKm: [3000, 5000] }])).toEqual([]);
    expect(unsupportedNumbers('36,075 of 87,249 departures', [{ a: 36075, b: 87249 }])).toEqual([]);
    expect(numbersIn('3000,5000')).toEqual(['3000', '5000']);
    expect(unsupportedNumbers('Under 1,500 km: 43.4%', [{ bands: [{ label: 'Under 1,500 km', sharePct: 43.4 }] }])).toEqual([]);
    expect(unsupportedNumbers('values 1 and 234', [{ list: [1, 234] }])).toEqual([]);
  });
});
