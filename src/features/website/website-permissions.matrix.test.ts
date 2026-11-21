import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { tenantCtx } from '@/test/helpers';
import { makePagesService } from './pages-service';
import { makePreviewService } from './preview-service';
import { makePublishService } from './publish-service';

/**
 * M3E-5. A structural guard, not a behaviour test: EVERY method of the website services must (a) be listed here with the permission
 * it needs and (b) refuse a caller without that permission BEFORE touching the repository.
 *
 * The method lists are read from the services themselves. Add a method without declaring it here and the "declared" test fails;
 * declare it but forget requirePermission() in the service and the matrix fails. The database is the real lock (see
 * supabase/tests/41); this stops the application layer from quietly being the weak link, and keeps D4 (a website editor saves
 * drafts but cannot go live) from eroding.
 */
const R = PERMISSIONS.websiteRead, W = PERMISSIONS.websiteWrite, P = PERMISSIONS.websitePublish;

const DECLARED = {
  pages: { listPages: R, getPageWithSections: R, ensureHomePage: W, createPage: W, updatePage: W, deletePage: W, addSection: W, insertSection: W, updateSection: W, deleteSection: W, reorderSections: W, setSectionStyle: W, getSectionForStyle: R },
  preview: { getDraft: R },
  publish: { getState: R, publish: P, rollback: P, unpublish: P },
} as const;

/** A repository that records every call and returns nothing useful: reaching it at all is what a forbidden caller must not do. */
function spyRepo() {
  const calls: string[] = [];
  const repo = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : (..._a: unknown[]) => { calls.push(String(k)); return Promise.resolve(null); }) });
  return { repo, calls };
}
function build() {
  const pages = spyRepo(), preview = spyRepo(), publish = spyRepo();
  return {
    services: {
      pages: makePagesService(pages.repo as never) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>,
      preview: makePreviewService(preview.repo as never) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>,
      publish: makePublishService(publish.repo as never) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>,
    },
    calls: { pages: pages.calls, preview: preview.calls, publish: publish.calls },
  };
}

const ID = '00000000-0000-4000-8000-0000000000aa';
/** Arguments are deliberately useless: an allowed caller may fail validation or not_found, but must never be told 'forbidden'. */
const outcome = async (fn: () => Promise<unknown>): Promise<string> => { try { await fn(); return 'ok'; } catch (e) { return (e as { code?: string })?.code ?? 'error'; } };

// Every combination of the three website permissions (8 callers), including combinations no seeded role has today.
const KEYS = [R, W, P];
const CALLERS = Array.from({ length: 8 }, (_, bits) => KEYS.filter((_k, i) => bits & (1 << i)));

describe('website services: every method is declared (a new method cannot ship without a permission)', () => {
  it.each(Object.keys(DECLARED) as Array<keyof typeof DECLARED>)('%s service exposes exactly the declared methods', (name) => {
    const actual = Object.keys(build().services[name]).sort();
    expect(actual).toEqual(Object.keys(DECLARED[name]).sort());
  });
});

describe('website services: permission matrix (8 callers x every method)', () => {
  for (const [svcName, methods] of Object.entries(DECLARED) as Array<[keyof typeof DECLARED, Record<string, string>]>) {
    for (const [method, needs] of Object.entries(methods)) {
      it.each(CALLERS.map((perms) => [perms.length ? perms.join('+') : 'no permission', perms] as const))(`${svcName}.${method} needs ${needs}: caller with %s`, async (_label, perms) => {
        const { services, calls } = build();
        const ctx = tenantCtx([...perms]);
        const got = await outcome(() => services[svcName]![method]!(ctx, ID, {}));
        if ((perms as readonly string[]).includes(needs)) {
          expect(got, 'a caller who holds the permission must not be refused').not.toBe('forbidden');
        } else {
          expect(got, 'a caller without the permission must be refused').toBe('forbidden');
          expect(calls[svcName], 'and the repository must not be reached at all').toEqual([]);
        }
      });
    }
  }
});

describe('website services: the editor/publisher split (D4) holds in both directions', () => {
  const editor = tenantCtx([R, W]);        // saves drafts
  const publisher = tenantCtx([R, P]);     // goes live
  it('an editor can change the draft and cannot go live, roll back or unpublish', async () => {
    const { services } = build();
    for (const m of Object.keys(DECLARED.publish).filter((k) => DECLARED.publish[k as keyof typeof DECLARED.publish] === P)) expect(await outcome(() => services.publish[m]!(editor, {}))).toBe('forbidden');
    expect(await outcome(() => services.pages.createPage!(editor, { slug: 'x', title: { en: 'X' } }))).not.toBe('forbidden');
  });
  it('a publisher cannot edit the draft', async () => {
    const { services } = build();
    for (const m of ['createPage', 'updatePage', 'deletePage', 'addSection', 'insertSection', 'updateSection', 'deleteSection', 'reorderSections', 'ensureHomePage']) expect(await outcome(() => services.pages[m]!(publisher, ID, {}))).toBe('forbidden');
  });
});

describe('website services: a client-supplied company is never accepted (tenant comes from the session)', () => {
  const ctx = tenantCtx([R, W, P]);
  const forged = [{ company_id: '00000000-0000-4000-8000-000000000102' }, { companyId: '00000000-0000-4000-8000-000000000102' }];
  it.each(forged.map((f) => [Object.keys(f)[0]!, f] as const))('createPage refuses %s and never reaches the repository', async (_k, f) => {
    const { services, calls } = build();
    expect(await outcome(() => services.pages.createPage!(ctx, { slug: 'x', title: { en: 'X' }, ...f }))).toBe('validation');
    expect(calls.pages).toEqual([]);
  });
  it.each(forged.map((f) => [Object.keys(f)[0]!, f] as const))('publish refuses %s and never reaches the repository', async (_k, f) => {
    const { services, calls } = build();
    expect(await outcome(() => services.publish.publish!(ctx, { note: 'x', ...f }))).toBe('validation');
    expect(calls.publish).toEqual([]);
  });
  it.each(forged.map((f) => [Object.keys(f)[0]!, f] as const))('rollback refuses %s and never reaches the repository', async (_k, f) => {
    const { services, calls } = build();
    expect(await outcome(() => services.publish.rollback!(ctx, { version: 1, ...f }))).toBe('validation');
    expect(calls.publish).toEqual([]);
  });
});
