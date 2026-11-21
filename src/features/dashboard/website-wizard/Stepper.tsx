'use client';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useDashLang } from '../lang';
import type { WizardState, WizardStep } from '@/features/website/wizard-state';
import { STEP_TEXT } from './copy';

/**
 * The five steps as a row across the top of the page. Numbered because they ARE a sequence; every step stays reachable (a returning
 * owner jumps straight to the part they want to change). A check means the step's data is complete, not that the owner visited it.
 * Logical spacing only, so the row reads right-to-left in Arabic with no extra code.
 */
export function Stepper({ steps, active }: { steps: WizardState['steps']; active: WizardStep }) {
  const lang = useDashLang();
  return (
    <nav aria-label={lang === 'ar' ? 'خطوات إعداد الموقع' : 'Website setup steps'}>
      <ol className="flex items-center gap-1 overflow-x-auto rounded-ds-lg border border-line-default bg-surface-card p-1.5">
        {steps.map((s, i) => {
          const on = s.key === active;
          return (
            <li key={s.key} className="min-w-fit flex-1">
              <Link
                href={`/dashboard/website?step=${s.key}`}
                aria-current={on ? 'step' : undefined}
                className={`flex items-center justify-center gap-2 rounded-ds-md px-3 py-2 text-sm whitespace-nowrap transition-colors duration-(--duration-ds-feedback) hover:bg-surface-sunken ${on ? 'bg-surface-sunken font-medium text-ink-primary' : 'text-ink-secondary'}`}
              >
                <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums ${s.complete ? 'bg-action text-on-action' : on ? 'border border-line-strong text-ink-primary' : 'border border-line-default text-ink-muted'}`}>
                  {s.complete ? <Check size={14} strokeWidth={2} /> : i + 1}
                </span>
                <span>{STEP_TEXT[s.key].label[lang]}</span>
                {s.complete && <span className="sr-only">{lang === 'ar' ? '(مكتمل)' : '(complete)'}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
