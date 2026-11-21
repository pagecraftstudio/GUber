'use client';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { buttonClass } from '@/ds/primitives/button-class';
import { useDashLang } from '../lang';

import { FLOW_STEPS, type FlowStep } from './flow-steps';
const LABEL: Record<FlowStep, { en: string; ar: string }> = {
  design: { en: 'Customize', ar: 'التخصيص' }, preview: { en: 'Preview', ar: 'المعاينة' }, publish: { en: 'Publish', ar: 'النشر' },
};
const href = (s: FlowStep) => `/dashboard/website?step=${s}`;

/** Where you are, not a menu: moving between steps is done with Back and Next only. */
export function FlowProgress({ active }: { active: FlowStep }) {
  const lang = useDashLang();
  const at = FLOW_STEPS.indexOf(active);
  return (
    <ol aria-label={lang === 'ar' ? 'خطوات الموقع' : 'Website steps'} className="flex items-center gap-2 text-sm">
      {FLOW_STEPS.map((s, i) => (
        <li key={s} aria-current={s === active ? 'step' : undefined} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-6 bg-line-default sm:w-10" />}
          <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${i < at ? 'bg-action text-on-action' : i === at ? 'border border-line-strong text-ink-primary' : 'border border-line-default text-ink-muted'}`}>{i < at ? <Check size={14} strokeWidth={2} /> : i + 1}</span>
          <span className={s === active ? 'font-medium text-ink-primary' : 'text-ink-muted'}>{LABEL[s][lang]}</span>
        </li>
      ))}
    </ol>
  );
}

export function FlowButtons({ active }: { active: FlowStep }) {
  const lang = useDashLang();
  const i = FLOW_STEPS.indexOf(active);
  const back = i > 0 ? FLOW_STEPS[i - 1]! : null, next = i < FLOW_STEPS.length - 1 ? FLOW_STEPS[i + 1]! : null;
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-line-default pt-4">
      {back ? <Link href={href(back)} className={buttonClass('secondary', 'md')}>{lang === 'ar' ? 'السابق' : 'Back'}</Link> : <span />}
      {next ? <Link href={href(next)} className={buttonClass('primary', 'md')}>{lang === 'ar' ? 'التالي' : 'Next'}</Link> : <span />}
    </div>
  );
}
