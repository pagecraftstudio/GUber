import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sections, SiteFooter } from './Sections';
import { trackAttrs } from './track';

const ID = '11111111-1111-4111-8111-111111111111', CO = '22222222-2222-4222-8222-222222222222';
const plan = { plan_id: ID, company_id: CO, route_id: CO, origin_name: 'Cairo', destination_name: 'Campus', name: 'Monthly', price: '900', currency: 'EGP', validity_type: 'duration' as const, duration_months: 1, starts_on: null, ends_on: null };
const trip = { trip_id: ID, route_id: CO, origin_name: 'Cairo', destination_name: 'Campus', departure_at: '2026-12-01T07:00:00Z', price: '40', currency: 'EGP', seats_available: 5, timezone: 'Africa/Cairo' };
const settings = { contact_email: 'a@b.co', contact_phone: '+20 100 123 4567', social_links: { facebook: 'https://facebook.com/x' } };
const ctx = (track: boolean) => ({ site: { schema_version: 1, settings, pages: [], media: {} }, locale: 'en' as const, supabaseUrl: 'https://x.supabase.co', trips: [trip], plans: [plan], ...(track ? { track: true } : {}) }) as never;
const secs = [
  { type: 'hero', content: { title: { en: 'Hi' }, cta_label: { en: 'Go' }, cta_href: '/s/x' } },
  { type: 'trips', content: { title: { en: 'Trips' } } },
  { type: 'subscriptions', content: { title: { en: 'Plans' } } },
  { type: 'contact', content: { title: { en: 'Contact' } } },
];

describe('company-site analytics markup', () => {
  it('trackAttrs is empty unless tracking is on', () => {
    expect(trackAttrs(false, 'book_click', { trip_id: 'x' })).toEqual({});
    expect(trackAttrs(undefined, 'book_click')).toEqual({});
    expect(trackAttrs(true, 'book_click', { trip_id: 'x' })).toEqual({ 'data-track': 'book_click', 'data-track-props': '{"trip_id":"x"}' });
  });
  it('with tracking OFF (dashboard preview and canvas) the output has no analytics hooks at all', () => {
    const html = renderToStaticMarkup(<Sections sections={secs} ctx={ctx(false)} />) + renderToStaticMarkup(<SiteFooter ctx={ctx(false)} name="Co" />);
    expect(html).not.toContain('data-track');
  });
  it('with tracking ON every section is marked and each action carries its event and catalog properties only', () => {
    const html = renderToStaticMarkup(<Sections sections={secs} ctx={ctx(true)} />) + renderToStaticMarkup(<SiteFooter ctx={ctx(true)} name="Co" />);
    for (const t of ['hero', 'trips', 'subscriptions', 'contact']) expect(html).toContain(`data-track-section="${t}"`);
    expect(html).toContain('data-track="cta_click"');
    expect(html).toContain(`data-track="book_click" data-track-props="{&quot;trip_id&quot;:&quot;${ID}&quot;}"`);
    expect(html).toContain(`data-track="subscription_request_click" data-track-props="{&quot;plan_id&quot;:&quot;${ID}&quot;}"`);
    expect(html).toContain('{&quot;channel&quot;:&quot;email&quot;}');
    expect(html).toContain('{&quot;channel&quot;:&quot;phone&quot;}');
    expect(html).toContain('{&quot;channel&quot;:&quot;facebook&quot;}');
  });
  it('never puts personal data in an attribute (no email address or phone number value)', () => {
    const attrs = (renderToStaticMarkup(<Sections sections={secs} ctx={ctx(true)} />).match(/data-track[a-z-]*="[^"]*"/g) ?? []).join(' ');
    expect(attrs).not.toContain('a@b.co');
    expect(attrs).not.toContain('100');
  });
});
