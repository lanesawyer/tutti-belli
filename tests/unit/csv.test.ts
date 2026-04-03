import { describe, it, expect } from 'vitest';
import { toCSV, csvResponse, type CsvColumn } from '../../src/lib/csv.ts';

type Row = { name: string; count: number; note: string | null };

const columns: CsvColumn<Row>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Count', value: (r) => r.count },
  { header: 'Note', value: (r) => r.note },
];

describe('toCSV', () => {
  it('produces a header row followed by data rows', () => {
    const csv = toCSV([{ name: 'Alice', count: 1, note: null }], columns);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Count,Note');
    expect(lines[1]).toBe('Alice,1,');
  });

  it('returns only a header row when given an empty array', () => {
    const csv = toCSV([], columns);
    expect(csv).toBe('Name,Count,Note');
  });

  it('escapes fields that contain commas', () => {
    const csv = toCSV([{ name: 'Smith, Jr.', count: 2, note: null }], columns);
    expect(csv).toContain('"Smith, Jr."');
  });

  it('escapes fields that contain double quotes', () => {
    const csv = toCSV([{ name: 'Say "hi"', count: 0, note: null }], columns);
    expect(csv).toContain('"Say ""hi"""');
  });

  it('escapes fields that contain newlines', () => {
    const csv = toCSV([{ name: 'Line\nBreak', count: 0, note: null }], columns);
    expect(csv).toContain('"Line\nBreak"');
  });

  it('escapes header fields that contain commas', () => {
    const cols: CsvColumn<Row>[] = [
      { header: 'Last, First', value: (r) => r.name },
    ];
    const csv = toCSV([], cols);
    expect(csv).toBe('"Last, First"');
  });

  it('renders null and undefined values as empty strings', () => {
    const csv = toCSV([{ name: 'Bob', count: 5, note: null }], columns);
    const line = csv.split('\r\n')[1];
    expect(line).toBe('Bob,5,');
  });

  it('renders numeric values without quotes', () => {
    const csv = toCSV([{ name: 'Bob', count: 42, note: null }], columns);
    expect(csv.split('\r\n')[1]).toContain('42');
  });

  it('produces correct output for multiple rows', () => {
    const rows: Row[] = [
      { name: 'Alice', count: 1, note: 'ok' },
      { name: 'Bob', count: 2, note: null },
    ];
    const lines = toCSV(rows, columns).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('Alice,1,ok');
    expect(lines[2]).toBe('Bob,2,');
  });
});

describe('csvResponse', () => {
  it('returns a 200 Response', () => {
    const res = csvResponse('a,b\r\n1,2', 'test.csv');
    expect(res.status).toBe(200);
  });

  it('sets Content-Type to text/csv', () => {
    const res = csvResponse('a,b', 'test.csv');
    expect(res.headers.get('Content-Type')).toContain('text/csv');
  });

  it('sets Content-Disposition as an attachment with the given filename', () => {
    const res = csvResponse('a,b', 'my export.csv');
    const disposition = res.headers.get('Content-Disposition')!;
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('my%20export.csv');
  });

  it('response body contains the csv string', async () => {
    const csv = 'Name,Email\r\nAlice,alice@example.com';
    const res = csvResponse(csv, 'test.csv');
    expect(await res.text()).toBe(csv);
  });
});
