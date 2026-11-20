import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { makePublishService } from './publish-service';
import type { PublishRepository, RpcOutcome } from './publish-repository';

const ok = (data: unknown): RpcOutcome => ({ data, error: null });
const err = (code: string, message = ''): RpcOutcome => ({ data: null, error: { code, message } });
function mk(over: Partial<Record<keyof PublishRepository, unknown>> = {}) {
  const repo = {
    isPublished: vi.fn().mockResolvedValue(true), listVersions: vi.fn().mockResolvedValue([]),
    publish: vi.fn().mockResolvedValue(ok(3)), rollback: vi.fn().mockResolvedValue(ok(4)), unpublish: vi.fn().mockResolvedValue(ok(null)), ...over,
  } as unknown as PublishRepository;
  return { repo, svc: makePublishService(repo) };
}
const pub = tenantCtx(['website.read', 'website.write', 'website.publish']);
const editor = tenantCtx(['website.read', 'website.write']);

describe('publish permissions (D4: editors save drafts, only website.publish goes live)', () => {
  it.each(['publish', 'rollback', 'unpublish'] as const)('%s needs website.publish; the database is not reached without it', async (op) => {
    const { repo, svc } = mk();
    const call = () => (op === 'publish' ? svc.publish(editor, {}) : op === 'rollback' ? svc.rollback(editor, { version: 1 }) : svc.unpublish(editor));
    await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo[op]).not.toHaveBeenCalled();
  });
  it('reading status needs website.read only', async () => {
    const { svc } = mk();
    await expect(svc.getState(tenantCtx(['website.read']))).resolves.toEqual({ isPublished: true, versions: [] });
    await expect(svc.getState(tenantCtx([]))).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('publish / rollback / unpublish', () => {
  it('publish passes a trimmed note (or null) and returns the version', async () => {
    const { repo, svc } = mk();
    expect(await svc.publish(pub, { note: '  first  ' })).toBe(3);
    expect(repo.publish).toHaveBeenLastCalledWith(expect.anything(), 'first');
    await svc.publish(pub, { note: '   ' }); expect(repo.publish).toHaveBeenLastCalledWith(expect.anything(), null);
    await svc.publish(pub, {}); expect(repo.publish).toHaveBeenLastCalledWith(expect.anything(), null);
  });
  it('note over 500 chars and unknown keys (company_id) are refused before the database', async () => {
    const { repo, svc } = mk();
    await expect(svc.publish(pub, { note: 'x'.repeat(501) })).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.publish(pub, { company_id: 'other' })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.publish).not.toHaveBeenCalled();
  });
  it('rollback needs a positive integer version', async () => {
    const { repo, svc } = mk();
    for (const version of [0, -1, 1.5, '2', null]) await expect(svc.rollback(pub, { version })).rejects.toMatchObject({ code: 'validation' });
    expect(repo.rollback).not.toHaveBeenCalled();
    expect(await svc.rollback(pub, { version: 2 })).toBe(4);
  });
  it('unpublish calls the database', async () => {
    const { repo, svc } = mk();
    await svc.unpublish(pub);
    expect(repo.unpublish).toHaveBeenCalledTimes(1);
  });
});

describe('database refusals become fixed errors', () => {
  it.each([
    ['site title is required', 'publish_title_required'], ['a published home page is required', 'publish_home_page_required'],
    ['the home page needs at least one enabled section', 'publish_home_section_required'], ['site is too large to publish', 'publish_too_large'],
  ])('checklist "%s"', async (message, detail) => {
    await expect(mk({ publish: vi.fn().mockResolvedValue(err('23514', message)) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'business_rule', detail });
  });
  it('invalid content, no subscription, version missing, permission', async () => {
    await expect(mk({ publish: vi.fn().mockResolvedValue(err('22023', 'secret <b>x</b>')) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'business_rule', detail: 'publish_invalid_content' });
    await expect(mk({ publish: vi.fn().mockResolvedValue(err('42501', 'no active subscription')) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'subscription_required' });
    await expect(mk({ rollback: vi.fn().mockResolvedValue(err('P0002', 'version not found')) }).svc.rollback(pub, { version: 9 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(mk({ publish: vi.fn().mockResolvedValue(err('42501', 'forbidden')) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('rate limit maps to rate_limited, unknown errors to internal without the message', async () => {
    await expect(mk({ publish: vi.fn().mockResolvedValue(err('PT429', 'rate limit exceeded')) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'rate_limited' });
    const e = await mk({ publish: vi.fn().mockResolvedValue(err('08006', 'host db.internal down')) }).svc.publish(pub, {}).catch((x) => x);
    expect(e).toMatchObject({ code: 'internal' });
    expect(String(e.message)).not.toContain('db.internal');
  });
  it('a publish that returns no version is an error, not a success', async () => {
    await expect(mk({ publish: vi.fn().mockResolvedValue(ok(null)) }).svc.publish(pub, {})).rejects.toMatchObject({ code: 'internal' });
  });
});
