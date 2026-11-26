import type { PublicSite } from './schema';
import { parseSection, type ParsedSection } from './sections';
import { sectionWrap } from './section-style';
import { mediaUrl, pick, safeHref, type SiteLocale } from './text';
import { RichText } from './RichText';
import { distinctRoutes } from './trip-routes';
import { Block, InsertSlot, Placeholder, type EditorBlock } from './editor-markup';
import { Fragment } from 'react';
import type { SiteTrip } from './trips-data';
import { planRequestPath, tripBookPath, type SitePlan } from './plans';
import { trackAttrs } from './track';

export interface SectionsCtx {
  site: PublicSite['site'];
  locale: SiteLocale;
  supabaseUrl: string;
  /** Loaded lazily by the page only when a trips/routes section exists. */
  trips: SiteTrip[];
  /** Loaded lazily by the page only when a subscriptions section exists. */
  plans?: SitePlan[];
  /** Public site only: adds the analytics markup hooks (see track.ts). Never set for the dashboard preview or canvas. */
  track?: boolean;
}

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="text-2xl font-semibold mb-4">{children}</h2>;
const Wrap = ({ children, id }: { children: React.ReactNode; id?: string }) => <section id={id} className="mx-auto w-full max-w-5xl px-4 py-[var(--sec-py,2.5rem)]">{children}</section>;

export const needsTrips = (site: PublicSite['site']): boolean =>
  site.pages.some((p) => p.sections.some((s) => s.type === 'trips' || s.type === 'routes'));

function formatDeparture(t: SiteTrip, locale: SiteLocale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: t.timezone }).format(new Date(t.departure_at));
  } catch { return t.departure_at; }
}
function formatPrice(t: SiteTrip, locale: SiteLocale): string {
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { style: 'currency', currency: t.currency }).format(Number(t.price));
  } catch { return `${t.price} ${t.currency}`; }
}

function formatMoney(price: number | string, currency: string, locale: SiteLocale): string {
  try { return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { style: 'currency', currency }).format(Number(price)); } catch { return `${price} ${currency}`; }
}

function planValidity(p: SitePlan, locale: SiteLocale): string {
  const ar = locale === 'ar';
  if (p.validity_type === 'duration' && p.duration_months !== null) return ar ? `${p.duration_months} ${p.duration_months === 1 ? 'شهر' : 'أشهر'}` : `${p.duration_months} ${p.duration_months === 1 ? 'month' : 'months'}`;
  return p.starts_on && p.ends_on ? (ar ? `من ${p.starts_on} إلى ${p.ends_on}` : `${p.starts_on} to ${p.ends_on}`) : '';
}

/** Applies the section's chosen look (E4). A section with no style (everything published before E4) is returned exactly as before: no wrapper. */
function Section({ s, ctx }: { s: ParsedSection; ctx: SectionsCtx }) {
  const inner = <SectionBody s={s} ctx={ctx} />;
  const wrap = sectionWrap(s.type, (s.content as { style?: unknown }).style);
  return wrap ? <div className={wrap.className} style={wrap.vars}>{inner}</div> : inner;
}

function SectionBody({ s, ctx }: { s: ParsedSection; ctx: SectionsCtx }) {
  const { locale, site } = ctx;
  switch (s.type) {
    case 'hero': {
      const img = mediaUrl(ctx.supabaseUrl, s.content.image_media_id ? site.media[s.content.image_media_id] : undefined);
      const href = safeHref(s.content.cta_href);
      const cta = pick(s.content.cta_label, locale);
      const title = pick(s.content.title, locale), subtitle = pick(s.content.subtitle, locale);
      if (img && s.content.image_position === 'full') {
        // Banner: the photo fills the section under a dark scrim, and the colours are fixed (white on near-black) so the text stays
        // readable on ANY photo and while the photo is still loading or missing. The company colour is not used on top of a photo.
        return (
          <section className="relative isolate overflow-hidden bg-[var(--ds-media-base)] text-[var(--ds-on-media)]">
            <img src={img} alt="" className="absolute inset-0 -z-20 size-full object-cover" loading="eager" />
            <div className="absolute inset-0 -z-10 bg-[var(--ds-media-scrim)]" aria-hidden="true" />
            <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-[var(--hero-py,5rem)] md:py-[var(--hero-py,7rem)]">
              <h1 className="max-w-3xl text-3xl font-bold md:text-5xl">{title}</h1>
              <p className="max-w-2xl text-lg">{subtitle}</p>
              {href && cta ? <a href={href} {...trackAttrs(ctx.track, 'cta_click', { section: 'hero', cta: 'primary' })} className="inline-block rounded-[var(--site-btn-radius,0.375rem)] bg-[var(--ds-on-media)] px-5 py-2.5 font-medium text-[var(--ds-media-base)]">{cta}</a> : null}
            </div>
          </section>
        );
      }
      return (
        <section className="bg-[var(--site-accent,var(--ds-action-primary))] text-[var(--site-on-accent,var(--ds-action-on-primary))]">
          <div className={`mx-auto grid w-full max-w-5xl gap-6 px-4 py-[var(--hero-py,3.5rem)] ${img ? 'md:grid-cols-2 md:items-center' : ''}`}>
            <div className="space-y-4">
              <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
              <p className="text-lg opacity-90">{subtitle}</p>
              {href && cta ? <a href={href} {...trackAttrs(ctx.track, 'cta_click', { section: 'hero', cta: 'primary' })} className="inline-block rounded-[var(--site-btn-radius,0.375rem)] bg-[var(--site-on-accent,var(--ds-action-on-primary))] px-5 py-2.5 font-medium text-[var(--site-accent,var(--ds-action-primary))]">{cta}</a> : null}
            </div>
            {img ? <img src={img} alt={(s.content.image_media_id && site.media[s.content.image_media_id]?.alt) || ''} className="max-h-80 w-full rounded-lg object-cover" loading="eager" /> : null}
          </div>
        </section>
      );
    }
    case 'about': return <Wrap id="about"><H2>{pick(s.content.title, locale)}</H2><RichText source={pick(s.content.body, locale)} /></Wrap>;
    case 'rich_text': return <Wrap><RichText source={pick(s.content.body, locale)} /></Wrap>;
    case 'features': return (
      <Wrap id="features">
        <H2>{pick(s.content.title, locale)}</H2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(s.content.items ?? []).map((it, i) => (
            <li key={i} className="rounded-lg border border-line-default p-4"><h3 className="font-semibold">{pick(it.title, locale)}</h3><p className="mt-1 text-ink-secondary">{pick(it.body, locale)}</p></li>
          ))}
        </ul>
      </Wrap>
    );
    case 'faq': return (
      <Wrap id="faq">
        <H2>{pick(s.content.title, locale)}</H2>
        <div className="space-y-2">
          {(s.content.items ?? []).map((it, i) => (
            <details key={i} className="rounded-lg border border-line-default p-4"><summary className="cursor-pointer font-medium">{pick(it.question, locale)}</summary><div className="mt-2 text-ink-secondary"><RichText source={pick(it.answer, locale)} /></div></details>
          ))}
        </div>
      </Wrap>
    );
    case 'image': {
      const m = s.content.image_media_id ? site.media[s.content.image_media_id] : undefined;
      const url = mediaUrl(ctx.supabaseUrl, m);
      if (!url) return null;
      return <Wrap><figure><img src={url} alt={m?.alt ?? ''} className="w-full rounded-lg" loading="lazy" />{pick(s.content.caption, locale) ? <figcaption className="mt-2 text-sm text-ink-secondary">{pick(s.content.caption, locale)}</figcaption> : null}</figure></Wrap>;
    }
    case 'routes': {
      const routes = distinctRoutes(ctx.trips);
      return (
        <Wrap id="routes">
          <H2>{pick(s.content.title, locale)}</H2>
          {routes.length === 0 ? <p className="text-ink-secondary">{locale === 'ar' ? 'لا توجد خطوط متاحة حاليًا.' : 'No routes available right now.'}</p>
            : <ul className="grid gap-3 sm:grid-cols-2">{routes.map((r, i) => <li key={i} className="rounded-lg border border-line-default p-4">{r.origin} <span aria-hidden>→</span><span className="sr-only">{locale === 'ar' ? 'إلى' : 'to'}</span> {r.destination}</li>)}</ul>}
        </Wrap>
      );
    }
    case 'trips': {
      const trips = ctx.trips.slice(0, s.content.limit ?? 10);
      return (
        <Wrap id="trips">
          <H2>{pick(s.content.title, locale)}</H2>
          {trips.length === 0 ? <p className="text-ink-secondary">{locale === 'ar' ? 'لا توجد رحلات قادمة.' : 'No upcoming trips.'}</p>
            : <ul className="divide-y divide-line-default rounded-lg border border-line-default">{trips.map((t) => (
              <li key={t.trip_id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <span className="font-medium">{t.origin_name} → {t.destination_name}</span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-ink-secondary">{formatDeparture(t, locale)} · {formatPrice(t, locale)} · {t.seats_available} {locale === 'ar' ? 'مقعد' : 'seats'}</span>
                  <a href={tripBookPath(t.trip_id)} {...trackAttrs(ctx.track, 'book_click', { trip_id: t.trip_id })} className="rounded-[var(--site-btn-radius,0.375rem)] bg-[var(--site-accent,var(--ds-action-primary))] px-3 py-1.5 text-sm font-medium text-[var(--site-on-accent,var(--ds-action-on-primary))]">{locale === 'ar' ? 'احجز' : 'Book'}</a>
                </span>
              </li>))}</ul>}
        </Wrap>
      );
    }
    case 'subscriptions': {
      const plans = ctx.plans ?? [];
      const ar = locale === 'ar';
      return (
        <Wrap id="subscriptions">
          <H2>{pick(s.content.title, locale)}</H2>
          {plans.length === 0 ? <p className="text-ink-secondary">{ar ? 'لا توجد باقات اشتراك متاحة حاليًا.' : 'No subscription plans available right now.'}</p>
            : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{plans.map((p) => (
              <li key={p.plan_id} className="flex flex-col rounded-lg border border-line-default p-4">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm text-ink-secondary">{p.origin_name} <span aria-hidden>→</span><span className="sr-only">{ar ? 'إلى' : 'to'}</span> {p.destination_name}</p>
                <p className="mt-2 text-xl font-semibold">{formatMoney(p.price, p.currency, locale)}</p>
                <p className="text-sm text-ink-secondary">{planValidity(p, locale)}</p>
                <a href={planRequestPath(p.plan_id)} {...trackAttrs(ctx.track, 'subscription_request_click', { plan_id: p.plan_id })} className="mt-3 inline-block self-start rounded-[var(--site-btn-radius,0.375rem)] bg-[var(--site-accent,var(--ds-action-primary))] px-4 py-2 text-sm font-medium text-[var(--site-on-accent,var(--ds-action-on-primary))]">{ar ? 'اطلب الاشتراك' : 'Request subscription'}</a>
              </li>))}</ul>}
        </Wrap>
      );
    }
    case 'contact': return <ContactBlock title={pick(s.content.title, locale)} ctx={ctx} />;
    case 'footer': return null;       // the footer is always rendered from settings (SiteFooter); a footer section must not duplicate it
  }
}

const SOCIAL_KEYS = ['facebook', 'instagram', 'x', 'tiktok', 'youtube', 'linkedin', 'telegram'] as const;

export function ContactBlock({ title, ctx }: { title: string; ctx: SectionsCtx }) {
  const st = ctx.site.settings;
  const email = st.contact_email && /^[^\s@<>]+@[^\s@<>]+$/.test(st.contact_email) ? st.contact_email : null;
  const phone = st.contact_phone && /^\+?[\d\s().-]{5,20}$/.test(st.contact_phone) ? st.contact_phone : null;
  const address = pick(st.contact_address, ctx.locale);
  return (
    <Wrap id="contact">
      {title ? <H2>{title}</H2> : null}
      <ul className="space-y-1">
        {email ? <li><a className="underline underline-offset-2" {...trackAttrs(ctx.track, 'contact_click', { channel: 'email' })} href={`mailto:${email}`}>{email}</a></li> : null}
        {phone ? <li><a className="underline underline-offset-2" {...trackAttrs(ctx.track, 'contact_click', { channel: 'phone' })} dir="ltr" href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a></li> : null}
        {address ? <li>{address}</li> : null}
      </ul>
    </Wrap>
  );
}

export function SiteFooter({ ctx, name }: { ctx: SectionsCtx; name: string }) {
  const st = ctx.site.settings;
  const text = pick(st.footer_text, ctx.locale);
  const links = SOCIAL_KEYS.flatMap((k) => { const h = safeHref(st.social_links?.[k]); return h && h.startsWith('https://') ? [{ k, h }] : []; });
  return (
    <footer className="mt-10 border-t border-line-default">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-secondary">
        <span>{text || name}</span>
        {links.length > 0 ? <ul className="flex gap-4">{links.map((l) => <li key={l.k}><a href={l.h} {...trackAttrs(ctx.track, 'contact_click', { channel: l.k })} rel="noopener noreferrer nofollow" className="underline underline-offset-2">{l.k}</a></li>)}</ul> : null}
      </div>
    </footer>
  );
}

/**
 * `editor` (dashboard canvas only, index-aligned with `sections`) wraps every section so it can be clicked, and adds "+" strips
 * between them. Without it the output is exactly what it always was: the public site is never wrapped.
 */
export function Sections({ sections, ctx, editor }: { sections: { type: string; content: unknown }[]; ctx: SectionsCtx; editor?: EditorBlock[] }) {
  if (!editor) {
    return sections.map((raw, i) => {
      const s = parseSection(raw);
      if (!s) return null;                                       // unknown type / invalid content: skipped, the rest of the page still renders
      // Tracking on (public site only): a plain block wrapper carries the section type so a view can be counted. Off: exactly the markup it always was.
      return ctx.track ? <div key={i} data-track-section={s.type}><Section s={s} ctx={ctx} /></div> : <Section key={i} s={s} ctx={ctx} />;
    });
  }
  return (
    <>
      {sections.length === 0 ? <InsertSlot index={0} prominent /> : null}
      {sections.map((raw, i) => {
        const block = editor[i];
        if (!block) return null;
        const s = parseSection(raw);
        const inner = s ? <Section s={s} ctx={ctx} /> : null;
        return (
          <Fragment key={block.id}>
            <InsertSlot index={i} />
            <Block block={block}>{inner ?? <Placeholder label={s ? block.label : `${block.label} (cannot be shown · لا يمكن عرضه)`} />}</Block>
          </Fragment>
        );
      })}
      {sections.length > 0 ? <InsertSlot index={sections.length} /> : null}
    </>
  );
}
