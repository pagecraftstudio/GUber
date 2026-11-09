import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../primitives/cx';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';
const TONE: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  info: { box: 'bg-status-info-bg text-status-info-fg', Icon: Info },
  success: { box: 'bg-status-success-bg text-status-success-fg', Icon: CheckCircle2 },
  warning: { box: 'bg-status-warning-bg text-status-warning-fg', Icon: TriangleAlert },
  error: { box: 'bg-status-error-bg text-status-error-fg', Icon: AlertCircle },
};
/** Info stays info-blue: it is fixed here so the scoped bridge can never turn a notice green. Icon plus text, never colour only. */
export function InlineAlert({ tone = 'info', title, children, action }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const { box, Icon } = TONE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-ds-md p-3 text-sm', box)}>
      <Icon size={18} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{title ? <p className="font-medium">{title}</p> : null}{children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}</div>
      {action}
    </div>
  );
}
