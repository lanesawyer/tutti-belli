export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
};

// Spreadsheet apps run cells that start with these as formulas, so a member named
// "=HYPERLINK(...)" would execute when an admin opens the export.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeField(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  let str = String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(str)) str = `'${str}`;
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeField(c.value(row))).join(','),
  );
  return [header, ...body].join('\r\n');
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
