'use client';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useDashLang } from '../lang';
import type { WizardState, WizardStep } from '@/features/website/wizard-state';
import { STEP_TEXT } from './copy';

/**
 * The five steps. Numbered because they ARE a sequence; every step stays reachable (a returning owner jumps straight to the part
 * they want to change). A check means the step's data is complete, not that the owner visited it. Rail on wide screens, strip on phones.
 */
export function Stepper({ steps, active }: { steps: WizardState['steps']; active: WizardStep }) {
  const lang = useDashLang();
  return (
    <nav aria-label={lang === 'ar' ? 'خطوات إعداد الموقع' : 'Website setup steps'} className="lg:sticky lg:top-6 lg:self-start">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {steps.map((s, i) => {
          const on = s.key === active;
          return (
            <li key={s.key} className="min-w-0 flex-1 lg:flex-none">
              <Link
                href={`/dashboard/website?step=${s.key}`}
                aria-current={on ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-ds-md px-3 py-2 text-sm transition-colors duration-(--duration-ds-feedback) hover:bg-surface-sunken ${on ? 'bg-surface-sunken font-medium text-ink-primary' : 'text-ink-secondary'}`}
              >
                <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${s.complete ? 'bg-action text-on-action' : on ? 'border border-line-strong text-ink-primary' : 'border border-line-default text-ink-muted'}`}>
                  {s.complete ? <Check size={14} strokeWidth={2} /> : i + 1}
                </span>
                <span className="truncate">{STEP_TEXT[s.key].label[lang]}</span>
                {s.complete && <span className="sr-only">{lang === 'ar' ? '(مكتمل)' : '(complete)'}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
