import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { adminPageOutcome } from './page-errors';

describe('adminPageOutcome: only "does not exist" becomes a 404', () => {
  it.each([
    ['PostgREST P0002 (what the admin RPCs raise for a missing/invisible row)', { code: 'P0002', message: 'company not found' }],
    ['PGRST116 (single-row query matched nothing)', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
  ])('%s -> missing', (_n, dbErr) => {
    expect(adminPageOutcome(mapDbError(dbErr))).toEqual({ kind: 'missing' });
  });

  it.each([
    ['internal XX000', { code: 'XX000', message: 'internal_error' }],
    ['PostgREST cannot reach the database', { code: 'PGRST000', message: 'Could not connect to the database' }],
    ['schema cache problem', { code: 'PGRST002', message: 'Could not query the database for the schema cache' }],
    ['statement timeout', { code: '57014', message: 'canceling statement due to statement timeout' }],
    ['too many connections', { code: '53300', message: 'sorry, too many clients already' }],
    ['unclassified RAISE EXCEPTION (P0001)', { code: 'P0001', message: 'something broke' }],
    ['no code at all (HTTP 500 from a proxy)', { message: 'Internal Server Error' }],
    ['permission denied', { code: '42501', message: 'forbidden' }],
    ['expired JWT', { code: 'PGRST301', message: 'JWT expired' }],
  ])('%s is NOT a 404', (_n, dbErr) => {
    const out = adminPageOutcome(mapDbError(dbErr));
    expect(out.kind).toBe('error');
  });

  it('unexpected throwables are errors, never 404', () => {
    for (const e of [new TypeError('x'), new Error('boom'), 'string', null, undefined]) expect(adminPageOutcome(e).kind).toBe('error');
  });

  it('the error message is safe: no SQLSTATE, SQL text or database wording', () => {
    const out = adminPageOutcome(mapDbError({ code: 'XX000', message: 'relation "app_private.secret" does not exist at character 14' }));
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).not.toMatch(/app_private|XX000|relation|character/i);
  });

  it('a malformed id is a 404 only where the caller opts in (audit entries), never by default', () => {
    const v = new AppError('validation');
    expect(adminPageOutcome(v)).toMatchObject({ kind: 'error' });
    expect(adminPageOutcome(v, { invalidInputIsMissing: true })).toEqual({ kind: 'missing' });
    expect(adminPageOutcome(new AppError('internal'), { invalidInputIsMissing: true }).kind).toBe('error');
  });
});

describe('mapDbError: P0002 is the only database "not found"', () => {
  it('maps P0002 to not_found and nothing else to not_found', () => {
    const codes = ['P0001', 'P0003', 'P0004', '02000', '42883', '42P01', '23503', '22P02', 'XX000', 'PGRST000', 'PGRST100', '08006', '40001', '40P01'];
    expect(mapDbError({ code: 'P0002', message: 'x' }).code).toBe('not_found');
    for (const code of codes) expect(mapDbError({ code, message: 'x' }).code, code).not.toBe('not_found');
  });
});
