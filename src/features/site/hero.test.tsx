import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sections } from './Sections';

const IMG = '00000000-0000-4000-8000-000000000701';
const media = { [IMG]: { path: 'c/website_image/h.png', mime: 'image/png' } };
const ctx = (m: Record<string, unknown> = media) => ({ site: { schema_version: 1, settings: {}, pages: [], media: m }, locale: 'en' as const, supabaseUrl: 'https://x.supabase.co', trips: [] }) as never;
const hero = (c: Record<string, unknown>, m?: Record<string, unknown>) => renderToStaticMarkup(<Sections sections={[{ type: 'hero', content: { title: { en: 'Welcome' }, subtitle: { en: 'Ride' }, ...c } }]} ctx={ctx(m)} />);

describe('hero image position', () => {
  it('"full": photo as a background under a scrim, fixed light-on-dark colours, image is decorative', () => {
    const html = hero({ image_media_id: IMG, image_position: 'full' });
    expect(html).toContain('/storage/v1/object/public/company-public/c/website_image/h.png');
    expect(html).toContain('bg-[var(--ds-media-scrim)]');
    expect(html).toContain('bg-[var(--ds-media-base)]'); expect(html).toContain('text-[var(--ds-on-media)]');
    expect(html).toContain('alt=""');
    expect(html).not.toContain('--site-accent');                    // the company colour is never put on top of a photo
  });
  it('"beside" and the default keep the two-column layout with the company colour', () => {
    for (const c of [{ image_media_id: IMG, image_position: 'beside' }, { image_media_id: IMG }]) {
      const html = hero(c);
      expect(html).toContain('md:grid-cols-2'); expect(html).toContain('--site-accent'); expect(html).not.toContain('bg-[var(--ds-media-scrim)]');
    }
  });
  it('no image (or one that is not in the media map): never a banner, single column', () => {
    for (const html of [hero({ image_position: 'full' }), hero({ image_media_id: IMG, image_position: 'full' }, {})]) {
      expect(html).not.toContain('<img'); expect(html).not.toContain('bg-[var(--ds-media-scrim)]'); expect(html).not.toContain('md:grid-cols-2');
    }
  });
  it('an unknown position value falls back to "beside"', () => {
    expect(hero({ image_media_id: IMG, image_position: 'sideways' })).toContain('md:grid-cols-2');
  });
  it('an SVG in the media map is never drawn', () => {
    expect(hero({ image_media_id: IMG, image_position: 'full' }, { [IMG]: { path: 'c/x.svg', mime: 'image/svg+xml' } })).not.toContain('<img');
  });
});
