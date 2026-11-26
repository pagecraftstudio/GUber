import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';
import { analyticsQuerySchema, exportQuerySchema, gapRowsSchema, toCohorts, toFunnel } from './types';

describe('csv', () => {
  it('neutralises spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
  it('writes BOM, CRLF and keeps Arabic intact', () => {
    const out = toCsv(['origin', 'n'], [['القاهرة', 3]]);
    expect(out.startsWith('\uFEFForigin,n\r\n')).toBe(true);
    expect(out).toContain('القاهرة,3\r\n');
  });
});

describe('query schemas', () => {
  it('defaults to 30 days and rejects other windows', () => {
    expect(analyticsQuerySchema.parse({}).days).toBe(30);
    expect(analyticsQuerySchema.parse({ days: '7' }).days).toBe(7);
    expect(analyticsQuerySchema.safeParse({ days: '9999' }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ kind: 'raw' }).success).toBe(false);
    expect(exportQuerySchema.parse({ kind: 'gaps' })).toEqual({ kind: 'gaps', days: 30 });
  });
  it('coerces bigint-as-string from the API and allows a null rate', () => {
    const r = gapRowsSchema.parse([{ origin: 'a', destination: 'b', searches: '5', zero_searches: '2', zero_rate: null }]);
    expect(r[0]).toMatchObject({ searches: 5, zero_searches: 2, zero_rate: null });
  });
});

describe('funnel', () => {
  it('orders steps and computes % of first and previous; guards divide by zero', () => {
    const f = toFunnel([
      { step: 'booking_start', ord: 2, visitor_days: 50 }, { step: 'trip_view', ord: 1, visitor_days: 200 },
      { step: 'booking_success', ord: 4, visitor_days: 0 }, { step: 'booking_submit', ord: 3, visitor_days: 25 },
    ]);
    expect(f.map((s) => s.step)).toEqual(['trip_view', 'booking_start', 'booking_submit', 'booking_success']);
    expect(f[1]).toMatchObject({ pctOfFirst: 25, pctOfPrevious: 25 });
    expect(f[2]).toMatchObject({ pctOfFirst: 12.5, pctOfPrevious: 50 });
    expect(f[3]).toMatchObject({ pctOfPrevious: 0 });
    expect(toFunnel([{ step: 'trip_view', ord: 1, visitor_days: 0 }, { step: 'booking_start', ord: 2, visitor_days: 0 }])[1]!.pctOfFirst).toBeNull();
  });
});

describe('cohorts', () => {
  it('computes retention and blanks weeks that have not happened yet', () => {
    const rows = [
      { cohort_week: '2026-11-02', week_offset: 0, visitors: 10 }, { cohort_week: '2026-11-02', week_offset: 1, visitors: 4 },
      { cohort_week: '2026-11-16', week_offset: 0, visitors: 8 },
    ];
    const c = toCohorts(rows, new Date('2026-11-25T12:00:00Z'));
    expect(c.map((x) => x.week)).toEqual(['2026-11-16', '2026-11-02']); // newest first
    const old = c[1]!;
    expect(old.size).toBe(10);
    expect(old.retention[0]).toBe(100);
    expect(old.retention[1]).toBe(40);
    expect(old.retention[2]).toBe(0);
    expect(old.retention[3]).toBe(0);
    expect(old.retention[4]).toBeNull(); // 3 full weeks since 2026-11-02, so +4w is in the future
    expect(c[0]!.retention[2]).toBeNull();
  });
});
