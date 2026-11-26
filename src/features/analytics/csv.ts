/** Cells that start with these are formulas in Excel/Sheets. Origins and destinations are typed by visitors, so they are untrusted. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: string | number | null): string {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF rows, UTF-8 BOM so Excel reads Arabic place names correctly. */
export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return '\uFEFF' + [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}
