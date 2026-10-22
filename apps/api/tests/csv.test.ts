import { describe, it, expect } from 'vitest';
import { CsvParser, num, parseCsvText, requireColumns } from '../src/data/csv';

const parseAll = (text: string, chunkSize = text.length) => {
  const p = new CsvParser();
  const rows: string[][] = [];
  for (let i = 0; i < text.length; i += chunkSize) rows.push(...p.push(text.slice(i, i + chunkSize)));
  rows.push(...p.end());
  return rows;
};

describe('CSV parser', () => {
  const text = 'a,b,c\r\n1,"Anchorage, AK","say ""hi"""\r\n2,"two\nlines",\n';

  it('handles quoted commas, doubled quotes, CRLF, empty last field and newlines inside quotes', () => {
    expect(parseAll(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'Anchorage, AK', 'say "hi"'],
      ['2', 'two\nlines', ''],
    ]);
  });

  it('gives the same result when the input arrives one character at a time (stream chunk boundaries)', () => {
    expect(parseAll(text, 1)).toEqual(parseAll(text));
  });

  it('parses a last line without a trailing newline', () => {
    expect(parseAll('x,y\n1,2')).toEqual([['x', 'y'], ['1', '2']]);
  });

  it('builds records from the header, strips a BOM and skips blank lines', () => {
    const recs = [...parseCsvText('﻿name,code\n\nBoston,BOS\n')];
    expect(recs).toEqual([{ name: 'Boston', code: 'BOS' }]);
  });
});

describe('CSV helpers', () => {
  it('keeps blanks as null, not 0', () => {
    expect(num('')).toBeNull();
    expect(num('  ')).toBeNull();
    expect(num('12.50')).toBe(12.5);
  });

  it('names missing columns so the user knows what to re-download', () => {
    expect(() => requireColumns({ YEAR: '2025' }, ['YEAR', 'DISTANCE'], 'export.csv')).toThrow(/DISTANCE/);
  });
});
