'use client';
import { Inbox, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDsText } from '../lang';
import { Button } from '../primitives/Button';
import { cx } from '../primitives/cx';

/** One sentence and one action. No illustration unless it explains something (Phase 7). */
export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-ink-muted" aria-hidden="true">{icon ?? <Inbox size={24} strokeWidth={1.5} />}</span>
      <p className="text-base font-medium text-ink-primary">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, onRetry, retryLabel }: { title?: string; description?: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  const t = useDsText();
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-status-error-fg" aria-hidden="true"><TriangleAlert size={24} strokeWidth={1.5} /></span>
      <p className="text-base font-medium text-ink-primary">{title ?? t.errorTitle}</p>
      <p className="max-w-sm text-sm text-ink-secondary">{description ?? t.errorBody}</p>
      {onRetry ? <div className="mt-2"><Button variant="secondary" onClick={onRetry}>{retryLabel ?? t.retry}</Button></div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-ds-sm bg-surface-sunken', className ?? 'h-4 w-full')} />;
}

/** Wrap skeletons so assistive tech hears one "Loading" instead of nothing. */
export function SkeletonRegion({ children, label }: { children: ReactNode; label?: string }) {
  const t = useDsText();
  return <div role="status" aria-busy="true"><span className="sr-only">{label ?? t.loading}</span>{children}</div>;
}
export const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <SkeletonRegion><div className="divide-y divide-line-default">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex gap-4 py-3.5"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/6" /></div>)}</div></SkeletonRegion>
);
export const SkeletonCard = () => <SkeletonRegion><div className="flex flex-col gap-3 rounded-ds-md border border-line-default p-4"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div></SkeletonRegion>;
