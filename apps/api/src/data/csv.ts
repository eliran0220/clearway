// Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM.
// Streams large files (the T-100 exports are 100-150 MB) without loading them into memory.
import { createReadStream } from 'node:fs';

export class CsvParser {
  private field = '';
  private row: string[] = [];
  private inQuotes = false;
  private quotePending = false; // saw a quote inside a quoted field; next char decides: "" or closing quote

  push(chunk: string): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i] as string;
      if (this.inQuotes) {
        if (this.quotePending) {
          this.quotePending = false;
          if (ch === '"') {
            this.field += '"';
            continue;
          }
          this.inQuotes = false; // that quote closed the field; handle ch as unquoted below
        } else if (ch === '"') {
          this.quotePending = true;
          continue;
        } else {
          this.field += ch;
          continue;
        }
      }
      if (ch === '"' && this.field === '') {
        this.inQuotes = true;
      } else if (ch === ',') {
        this.row.push(this.field);
        this.field = '';
      } else if (ch === '\n') {
        this.row.push(this.field);
        this.field = '';
        out.push(this.row);
        this.row = [];
      } else if (ch !== '\r') {
        this.field += ch;
      }
    }
    return out;
  }

  end(): string[][] {
    if (this.quotePending) {
      this.quotePending = false;
      this.inQuotes = false;
    }
    if (this.field !== '' || this.row.length > 0) {
      this.row.push(this.field);
      const last = this.row;
      this.row = [];
      this.field = '';
      return [last];
    }
    return [];
  }
}

export type CsvRecord = Record<string, string>;

function* toRecords(rows: string[][], state: { header: string[] | null }): Generator<CsvRecord> {
  for (const row of rows) {
    if (!state.header) {
      state.header = row.map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim());
      continue;
    }
    if (row.length === 1 && row[0] === '') continue; // blank line
    const rec: CsvRecord = {};
    state.header.forEach((name, i) => {
      if (name) rec[name] = row[i] ?? '';
    });
    yield rec;
  }
}

/** Streams a CSV file as records keyed by the header row. */
export async function* readCsvFile(path: string): AsyncGenerator<CsvRecord> {
  const parser = new CsvParser();
  const state = { header: null as string[] | null };
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 });
  for await (const chunk of stream) yield* toRecords(parser.push(chunk as string), state);
  yield* toRecords(parser.end(), state);
}

/** Parses CSV text already in memory (OurAirports is about 12 MB). */
export function* parseCsvText(text: string): Generator<CsvRecord> {
  const parser = new CsvParser();
  const state = { header: null as string[] | null };
  yield* toRecords(parser.push(text), state);
  yield* toRecords(parser.end(), state);
}

/** Missing or blank stays null (unavailable); it never becomes 0. */
export function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function int(v: string | undefined): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

/** Throws a clear error when an export is missing columns the importer needs. */
export function requireColumns(rec: CsvRecord, required: readonly string[], what: string): void {
  const missing = required.filter((c) => !(c in rec));
  if (missing.length) {
    throw new Error(`${what} is missing columns: ${missing.join(', ')}. Re-download the export with these fields ticked.`);
  }
}
