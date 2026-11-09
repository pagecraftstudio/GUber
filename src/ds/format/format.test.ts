import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDuration, formatMoney, formatNumber, formatPercent, formatTime, integerFromInput, normalizeDigits, parseAmountInput, parseIntegerInput } from '.';

const AR = '٠١٢٣٤٥٦٧٨٩';
describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits', () => expect(normalizeDigits(AR)).toBe('0123456789'));
  it('converts Persian digits', () => expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789'));
  it('converts Arabic decimal and thousands separators', () => expect(normalizeDigits('١٢٬٣٤٥٫٦٧')).toBe('12,345.67'));
  it('handles mixed digit systems and text', () => expect(normalizeDigits('MB-٧K3Q٩X ۱2')).toBe('MB-7K3Q9X 12'));
  it('leaves ASCII untouched and handles empty', () => { expect(normalizeDigits('MB-7K3Q9X +20 100')).toBe('MB-7K3Q9X +20 100'); expect(normalizeDigits('')).toBe(''); });
});

describe('input parsers', () => {
  it('amount: same rule as before the redesign', () => {
    const table: [string, number | null][] = [['50', 50], ['50.5', 50.5], ['50,5', 50.5], ['٥٠٫٥', 50.5], ['٥٠,٥', 50.5], [' 12.34 ', 12.34], ['1.234', null], ['1,000', null], ['-5', null], ['', null], ['abc', null], ['5.', null]];
    for (const [i, o] of table) expect(parseAmountInput(i), i).toBe(o);
    expect(parseAmountInput(50)).toBeNull();
  });
  it('integer', () => { expect(parseIntegerInput('٣')).toBe(3); expect(parseIntegerInput('12')).toBe(12); expect(parseIntegerInput('1.5')).toBeNull(); expect(parseIntegerInput('')).toBeNull(); expect(parseIntegerInput('1234567890')).toBeNull(); });
  it('integerFromInput converts digit strings and leaves everything else for the schema to reject', () => { expect(integerFromInput('٣')).toBe(3); expect(integerFromInput(4)).toBe(4); expect(integerFromInput('x')).toBe('x'); expect(integerFromInput(null)).toBeNull(); });
});

describe('formatNumber / percent', () => {
  it('en uses Latin digits', () => expect(formatNumber(1234567, 'en')).toBe('1,234,567'));
  it('ar uses Arabic-Indic digits', () => expect(formatNumber(1234567, 'ar')).toBe('١٬٢٣٤٬٥٦٧'));
  it('percent', () => { expect(formatPercent(0.42, 'en')).toBe('42%'); expect(formatPercent(0.42, 'ar')).toMatch(/^٤٢/); });
  it('non-finite is empty, never "NaN"', () => { expect(formatNumber(NaN, 'en')).toBe(''); expect(formatMoney(Infinity, 'EGP', 'ar')).toBe(''); });
});

describe('formatMoney', () => {
  it('English: EGP before the amount', () => expect(formatMoney(150, 'EGP', 'en')).toBe('EGP 150'));
  it('Arabic: ج.م after the amount, Arabic-Indic digits', () => expect(formatMoney(150, 'EGP', 'ar')).toBe('١٥٠ ج.م'));
  it('fractional amounts show two decimals, fixed forces them', () => {
    expect(formatMoney(150.5, 'EGP', 'en')).toBe('EGP 150.50');
    expect(formatMoney(150, 'EGP', 'en', { fixed: true })).toBe('EGP 150.00');
    expect(formatMoney(150.5, 'EGP', 'ar')).toBe('١٥٠٫٥٠ ج.م');
  });
  it('other currencies use their ISO code', () => expect(formatMoney(20, 'usd', 'en')).toBe('USD 20'));
});

describe('dates and times (company time zone, 24-hour)', () => {
  const t = '2026-11-09T14:30:00Z'; // Cairo is UTC+2 in November 2026
  it('en', () => { expect(formatTime(t, 'en', { timeZone: 'Africa/Cairo' })).toBe('16:30'); expect(formatDate(t, 'en', { timeZone: 'Africa/Cairo' })).toBe('09/11/2026'); expect(formatDateTime(t, 'en', { timeZone: 'Africa/Cairo' })).toBe('09/11/2026 16:30'); });
  it('ar uses Arabic-Indic digits and the same wall clock', () => { expect(formatTime(t, 'ar', { timeZone: 'Africa/Cairo' })).toBe('١٦:٣٠'); expect(formatDate(t, 'ar', { timeZone: 'Africa/Cairo' })).toBe('٠٩\u200f/١١\u200f/٢٠٢٦'); });
  it('the time zone decides the day', () => expect(formatDate('2026-11-09T23:30:00Z', 'en', { timeZone: 'Africa/Cairo' })).toBe('10/11/2026'));
  it('long style', () => expect(formatDate(t, 'en', { timeZone: 'Africa/Cairo', style: 'long' })).toBe('9 November 2026'));
  it('invalid input is empty', () => { expect(formatDate('nope', 'en')).toBe(''); expect(formatTime('nope', 'ar')).toBe(''); });
});

describe('formatDuration', () => {
  it('en', () => { expect(formatDuration(210, 'en')).toBe('3 h 30 min'); expect(formatDuration(120, 'en')).toBe('2 h'); expect(formatDuration(45, 'en')).toBe('45 min'); });
  it('ar', () => expect(formatDuration(210, 'ar')).toBe('٣ س ٣٠ د'));
  it('invalid', () => expect(formatDuration(-1, 'en')).toBe(''));
});
