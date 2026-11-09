import { describe, expect, it } from 'vitest';
import { isSurfaceScoped } from './scope';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('DS allow-list', () => {
  it('default is off everywhere', () => {
    expect(isSurfaceScoped('dashboard', A, {})).toBe(false);
    expect(isSurfaceScoped('marketplace', null, {})).toBe(false);
  });
  it('flips whole surfaces', () => {
    const env = { DS_SURFACES: 'marketplace, Dashboard' };
    expect(isSurfaceScoped('marketplace', null, env)).toBe(true);
    expect(isSurfaceScoped('dashboard', A, env)).toBe(true);
    expect(isSurfaceScoped('admin', null, env)).toBe(false);
  });
  it('"all" flips everything', () => {
    expect(isSurfaceScoped('driver', null, { DS_SURFACES: 'all' })).toBe(true);
  });
  it('pilot company flips tenant surfaces for that company only', () => {
    const env = { DS_PILOT_COMPANIES: A };
    expect(isSurfaceScoped('dashboard', A, env)).toBe(true);
    expect(isSurfaceScoped('public', A.toUpperCase(), env)).toBe(true);
    expect(isSurfaceScoped('dashboard', B, env)).toBe(false);
  });
  it('pilot list never flips non-tenant surfaces', () => {
    expect(isSurfaceScoped('admin', A, { DS_PILOT_COMPANIES: A })).toBe(false);
    expect(isSurfaceScoped('marketplace', A, { DS_PILOT_COMPANIES: A })).toBe(false);
  });
  it('ignores malformed ids and unknown surface names', () => {
    expect(isSurfaceScoped('dashboard', 'not-a-uuid', { DS_PILOT_COMPANIES: 'not-a-uuid' })).toBe(false);
    expect(isSurfaceScoped('dashboard', A, { DS_SURFACES: 'bogus' })).toBe(false);
  });
});
