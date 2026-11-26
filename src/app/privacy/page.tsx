import { ConsentSettings } from '@/components/analytics/ConsentSettings';
import { readConsentState } from '@/components/analytics/AnalyticsRoot';
import { PRIVACY_NOTICE } from '@/lib/analytics/privacy-notice';
import type { AnalyticsLocale } from '@/lib/analytics/copy';

export const metadata = { title: 'Privacy · MASAR' };
export const dynamic = 'force-dynamic';

const ORDER: AnalyticsLocale[] = ['ar', 'en'];

/** Public notice in both languages (the marketplace language is a client-side choice, so the server shows both). Text is a DRAFT with [PLACEHOLDERS]: counsel must review before launch (decision D6). */
export default async function PrivacyPage() {
  const state = await readConsentState();
  return (
    <main className="mx-auto max-w-3xl space-y-12 p-4 text-ink-primary">
      {ORDER.map((locale) => {
        const n = PRIVACY_NOTICE[locale];
        return (
          <article key={locale} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} className="space-y-6">
            <h1 className="text-2xl font-semibold">{n.title}</h1>
            <p className="text-sm text-ink-muted">{n.version}</p>
            {n.sections.map((s) => (
              <section key={s.h} className="space-y-2">
                <h2 className="text-lg font-semibold">{s.h}</h2>
                {s.p.map((p) => <p key={p} className="text-base text-ink-secondary">{p}</p>)}
                {s.li ? <ul className="list-disc space-y-1 ps-6 text-base text-ink-secondary">{s.li.map((i) => <li key={i}>{i}</li>)}</ul> : null}
              </section>
            ))}
            <ConsentSettings locale={locale} state={state} />
          </article>
        );
      })}
    </main>
  );
}
