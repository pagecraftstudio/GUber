'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDate } from '@/ds/format';
import { buttonClass } from '@/ds/primitives/button-class';
import { loadProfileOverviewAction, type ProfileOverview } from '../actions';
import { MasarIdCard } from './MySubscriptionsView';
import { MT } from './text';

const X = {
  en: { subs: 'My subscriptions', none: 'No subscriptions yet.', manage: 'Manage subscriptions', plans: 'Browse plans', until: (d: string) => `until ${d}`, error: 'Could not load your MASAR ID. Check your connection.', loading: 'Loading…' },
  ar: { subs: 'اشتراكاتي', none: 'لا توجد اشتراكات بعد.', manage: 'إدارة الاشتراكات', plans: 'تصفح الخطط', until: (d: string) => `حتى ${d}`, error: 'تعذر تحميل رقم MASAR الخاص بك. تحقق من الاتصال.', loading: 'جارٍ التحميل…' },
} as const;

/** The member's MASAR ID (with the rotating QR) and subscriptions, shown inside the marketplace profile tab. */
export function ProfileMasarSection({ lang }: { lang: 'en' | 'ar' }) {
  const [data, setData] = useState<ProfileOverview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadProfileOverviewAction().then((r) => { if (!live) return; if (r.ok) setData(r.data); else setFailed(true); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const x = X[lang];
  const t = MT[lang];
  if (failed) return <p role="alert" className="mb-6 text-sm font-medium text-status-error-fg">{x.error}</p>;
  if (!data) return <p className="mb-6 text-sm text-ink-secondary" aria-live="polite">{x.loading}</p>;
  return (
    <div className="mb-6 space-y-4">
      <MasarIdCard lang={lang} id={data.masarId} />
      <section aria-labelledby="prof-subs" className="rounded-2xl border border-line-default bg-surface-card p-5">
        <h2 id="prof-subs" className="font-semibold">{x.subs}</h2>
        {data.subs.length === 0 ? <p className="mt-1 text-sm text-ink-secondary">{x.none}</p> : (
          <ul className="mt-2 divide-y divide-line-default">
            {data.subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium">{s.planName}</span> · {s.companyName}{s.validTo && s.status === 'active' ? ` · ${x.until(formatDate(s.validTo, lang))}` : ''}</span>
                <span className="text-ink-secondary">{t.status[s.status] ?? s.status}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/my-subscriptions" className={buttonClass('secondary', 'md')}>{x.manage}</Link>
          <Link href="/my-subscriptions/plans" className={buttonClass('secondary', 'md')}>{x.plans}</Link>
        </div>
      </section>
    </div>
  );
}
