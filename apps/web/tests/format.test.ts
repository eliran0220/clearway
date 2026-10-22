import { describe, expect, it } from 'vitest';
import { alignedPcts, compact, dayLabel, monthLabel, speakable, splitLead } from '../lib/format';

describe('display formatting', () => {
  it('gives a column of percentages the same decimals', () => {
    expect(alignedPcts([19.3, 18])).toEqual(['19.3%', '18.0%']);
    expect(alignedPcts([1, 0.93])).toEqual(['1.00%', '0.93%']);
    expect(alignedPcts([null, 5])).toEqual(['n/a', '5%']);
  });

  it('labels months and days without time-zone drift', () => {
    expect(monthLabel('2026-04')).toBe('Apr 2026');
    expect(dayLabel('2027-05-28T16:00:00Z')).toBe('28 May 2027');
    expect(dayLabel('2026-05-27T23:59:00Z')).toBe('27 May 2026');
  });

  it('shortens large counts', () => {
    expect(compact(2_147_010)).toBe('2.1M');
    expect(compact(87_319)).toBe('87K');
    expect(compact(null)).toBe('n/a');
  });
});

describe('answer text', () => {
  it('splits the direct answer from the explanation', () => {
    expect(splitLead('BGR ranks first.\n\nWhy: growth.\n\nLimits.')).toEqual(['BGR ranks first.', 'Why: growth.\n\nLimits.']);
    expect(splitLead('Only one paragraph.')).toEqual(['Only one paragraph.', '']);
  });

  it('reads aloud the first plain paragraph without markdown', () => {
    expect(speakable('| a | b |\n\n**BGR** ranks [first](https://x).\n\nMore.')).toBe('BGR ranks first.');
  });
});
