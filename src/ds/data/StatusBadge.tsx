'use client';
import { Check, Circle, Clock, Minus, X } from 'lucide-react';
import { useDsLang } from '../lang';
import type { Lang } from '../format';
import { cx } from '../primitives/cx';
import { STATUS_MAP, type StatusDef, type StatusDomain, type StatusIcon } from './status-map';

const ICON: Record<StatusIcon, (p: { className?: string }) => React.ReactElement> = {
  check: (p) => <Check size={14} strokeWidth={1.5} aria-hidden="true" {...p} />,
  clock: (p) => <Clock size={14} strokeWidth={1.5} aria-hidden="true" {...p} />,
  x: (p) => <X size={14} strokeWidth={1.5} aria-hidden="true" {...p} />,
  minus: (p) => <Minus size={14} strokeWidth={1.5} aria-hidden="true" {...p} />,
  circle: (p) => <Circle size={14} strokeWidth={1.5} aria-hidden="true" {...p} />,
  dot: (p) => <span aria-hidden="true" className={cx('size-1.5 rounded-full bg-current', p.className)} />,
  live: (p) => <span aria-hidden="true" className={cx('size-2 rounded-full bg-current', p.className)} />,
};
const TONE = {
  success: 'bg-status-success-bg text-status-success-fg', warning: 'bg-status-warning-bg text-status-warning-fg', error: 'bg-status-error-bg text-status-error-fg',
  info: 'bg-status-info-bg text-status-info-fg', neutral: 'bg-status-neutral-bg text-status-neutral-fg',
} as const;

/** Icon + label + tint, from the single status map. An unknown value renders as neutral text instead of crashing. */
export function StatusBadge({ domain, value, lang }: { domain: StatusDomain; value: string; lang?: Lang }) {
  const l = useDsLang(lang);
  const def = (STATUS_MAP[domain] as Record<string, StatusDef>)[value];
  const Icon = ICON[def?.icon ?? 'dot'];
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-ds-sm px-2 text-[13px] font-medium whitespace-nowrap', TONE[def?.tone ?? 'neutral'])}>
      <Icon />{def ? def.label[l] : value}
    </span>
  );
}
