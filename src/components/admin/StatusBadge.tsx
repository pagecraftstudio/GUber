const STYLES: Record<string, string> = {
  active: 'border-status-success-fg bg-status-success-bg text-status-success-fg',
  trial: 'border-status-warning-fg bg-status-warning-bg text-status-warning-fg',
  trialing: 'border-status-warning-fg bg-status-warning-bg text-status-warning-fg',
  past_due: 'border-status-warning-fg bg-status-warning-bg text-status-warning-fg',
  suspended: 'border-status-error-fg bg-status-error-bg text-status-error-fg',
  cancelled: 'border-line-default bg-surface-sunken text-ink-secondary',
  expired: 'border-line-default bg-surface-sunken text-ink-secondary',
  live: 'border-status-success-fg bg-status-success-bg text-status-success-fg',
  stale: 'border-status-error-fg bg-status-error-bg text-status-error-fg',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.cancelled}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
