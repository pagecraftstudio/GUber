import { describe, expect, it } from 'vitest';
import { ilikeAny, sanitizeSearch } from './search';

describe('sanitizeSearch', () => {
  it('keeps letters in any script, digits, and email/phone characters', () => {
    expect(sanitizeSearch('  Ahmed  Ali ')).toBe('Ahmed Ali');
    expect(sanitizeSearch('أحمد علي')).toBe('أحمد علي');
    expect(sanitizeSearch('a.b+c@x-y.com')).toBe('a.b+c@x-y.com');
    expect(sanitizeSearch('+20 100 123')).toBe('+20 100 123');
  });
  it('strips every PostgREST filter metacharacter (no filter injection)', () => {
    const evil = 'x%,deleted_at.is.null),or(company_id.neq.1,"\\*_';
    const out = sanitizeSearch(evil);
    expect(out).not.toMatch(/[,()"\\*%_]/);
  });
  it('caps length and handles empty', () => {
    expect(sanitizeSearch('a'.repeat(500)).length).toBe(100);
    expect(sanitizeSearch(undefined)).toBe('');
    expect(sanitizeSearch('%%%')).toBe('');
  });
});

describe('ilikeAny', () => {
  it('builds one clause per column', () => expect(ilikeAny(['a', 'b'], 'zed')).toBe('a.ilike.%zed%,b.ilike.%zed%'));
  it('returns null when nothing searchable remains', () => expect(ilikeAny(['a'], '%,()')).toBeNull());
  it('an injected term cannot add clauses', () => {
    const s = ilikeAny(['name'], 'x,company_id.eq.other')!;
    expect(s.split(',').length).toBe(1);
  });
});
