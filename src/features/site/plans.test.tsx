import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sections } from './Sections';
import { needsPlans, planRequestPath, sitePlanRowSchema } from './plans';
import { planFocus } from '@/features/my-subscriptions/plan-focus';
import { safeNextPath, loginPathFor } from '@/lib/auth/redirect';

const ID = '11111111-1111-4111-8111-111111111111', CO = '22222222-2222-4222-8222-222222222222';
const plan = { plan_id: ID, company_id: CO, route_id: CO, origin_name: 'Cairo', destination_name: 'Campus', name: 'Monthly', price: '900', currency: 'EGP', validity_type: 'duration' as const, duration_months: 1, starts_on: null, ends_on: null };
const ctx = (plans: unknown[]) => ({ site: { schema_version: 1, settings: {}, pages: [], media: {} }, locale: 'en' as const, supabaseUrl: 'https://x.supabase.co', trips: [], plans }) as never;
const secs = [{ type: 'subscriptions', content: { title: { en: 'Plans' } } }];

describe('subscriptions section', () => {
  it('draws each plan with its route, price and a request link to the member page', () => {
    const html = renderToStaticMarkup(<Sections sections={secs} ctx={ctx([plan])} />);
    expect(html).toContain('Monthly'); expect(html).toContain('Cairo'); expect(html).toContain('Campus');
    expect(html).toContain(`href="/my-subscriptions/plans?plan=${ID}"`);
    expect(html).toContain('Request subscription');
  });
  it('says so when there are no plans, and never renders a request link then', () => {
    const html = renderToStaticMarkup(<Sections sections={secs} ctx={ctx([])} />);
    expect(html).toContain('No subscription plans'); expect(html).not.toContain('/my-subscriptions');
  });
  it('the row schema is an allow-list shape and the helpers behave', () => {
    expect(sitePlanRowSchema.safeParse(plan).success).toBe(true);
    expect(sitePlanRowSchema.safeParse({ ...plan, plan_id: 'x' }).success).toBe(false);
    expect(needsPlans([[{ type: 'faq' }], [{ type: 'subscriptions' }]])).toBe(true);
    expect(needsPlans([[{ type: 'faq' }]])).toBe(false);
    expect(planRequestPath(ID)).toBe(`/my-subscriptions/plans?plan=${ID}`);
  });
});

describe('sign-in return path', () => {
  it('?plan= must be a UUID; anything else is dropped', () => {
    expect(planFocus(ID.toUpperCase())).toBe(ID);
    for (const bad of [undefined, '', 'x', `${ID}&next=//evil`, '../../etc']) expect(planFocus(bad)).toBeNull();
  });
  it('the member area is an allowed return target and uses the customer login; look-alikes are refused', () => {
    expect(safeNextPath(`/my-subscriptions/plans?plan=${ID}`, '')).toBe(`/my-subscriptions/plans?plan=${ID}`);
    expect(loginPathFor('/my-subscriptions/plans')).toBe('/login');
    for (const bad of ['//evil.com', '/my-subscriptionsx', 'https://evil.com/my-subscriptions', '/my-subscriptions/../dashboard']) expect(safeNextPath(bad, '')).toBe('');
  });
});
