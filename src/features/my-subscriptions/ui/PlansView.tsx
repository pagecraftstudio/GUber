'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatDay, formatMoney, formatNumber } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { useCaptchaGate } from '@/components/captcha/useCaptchaGate';
import { requestPlanAction } from '../actions';
import type { PublicPlan } from '../types';
import { MT } from './text';
import { useMemberAction } from './useMemberAction';

function PlanCard({ lang, p, hasPhone, highlight }: { lang: 'en' | 'ar'; p: PublicPlan; hasPhone: boolean; highlight: boolean }) {
  const t = MT[lang];
  const { pending, error, run } = useMemberAction(lang);
  const [sent, setSent] = useState(false);
  const gate = useCaptchaGate('subscription', lang);
  const validity = p.validityType === 'duration' && p.durationMonths !== null
    ? t.months(formatNumber(p.durationMonths, lang), p.durationMonths === 1 ? t.monthsOne : t.monthsMany)
    : p.startsOn && p.endsOn ? t.range(formatDay(p.startsOn, lang, 'numeric'), formatDay(p.endsOn, lang, 'numeric')) : '';
  return (
    <article className={`rounded-2xl border bg-surface-card p-5 ${highlight ? 'border-line-strong ring-2 ring-focus' : 'border-line-default'}`} aria-label={`${p.name} ${p.companyName}`}>
      <h3 className="font-semibold">{p.name}</h3>
      <p className="text-sm text-ink-secondary">{p.companyName} · {p.originName} → {p.destinationName}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{formatMoney(p.price, p.currency, lang)}</p>
      <p className="text-sm text-ink-secondary">{validity}</p>
      {gate.widget ? <div className="mt-3">{gate.widget}</div> : null}
      <Button className="mt-3" disabled={pending || sent || !hasPhone || !gate.ready} onClick={() => { const token = gate.token; gate.spent(); run(() => requestPlanAction(p.planId, token), () => setSent(true)); }}>{sent ? t.requested : t.request}</Button>
      {!hasPhone ? <p className="mt-1 text-sm text-ink-secondary"><Link className="underline" href="/my-subscriptions">{t.phoneTitle}</Link></p> : null}
      {error ? <p role="alert" className="mt-1 text-sm font-medium text-status-error-fg">{error}</p> : null}
    </article>
  );
}

export function PlansView({ lang, plans, hasPhone, highlightPlanId = null }: { lang: 'en' | 'ar'; plans: PublicPlan[]; hasPhone: boolean; highlightPlanId?: string | null }) {
  const t = MT[lang];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{t.plansTitle}</h1><p className="mt-1 text-sm text-ink-secondary">{t.plansText}</p></div>
        <Link href="/my-subscriptions" className={buttonClass('secondary', 'md')}>{t.title}</Link>
      </div>
      {plans.length === 0
        ? <section className="rounded-2xl border border-dashed border-line-default p-8 text-center"><h2 className="font-semibold">{t.noPlans}</h2><p className="mt-1 text-sm text-ink-secondary">{t.noPlansText}</p></section>
        : <div className="grid gap-4 md:grid-cols-2">{plans.map((p) => <PlanCard key={p.planId} lang={lang} p={p} hasPhone={hasPhone} highlight={p.planId === highlightPlanId} />)}</div>}
    </div>
  );
}
