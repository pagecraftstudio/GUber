export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface-card/60 px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-ink-muted">{description}</p>
    </div>
  );
}

/** `message` must already be a safe client message (AppError.message / toClientError), never a raw error. */
export function AdminErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-status-error-fg bg-status-error-bg px-4 py-6 text-center">
      <p className="text-sm font-semibold text-status-error-fg">Could not load this page</p>
      <p className="mt-1 text-xs text-status-error-fg">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-status-error-fg bg-surface-card px-3 py-1.5 text-xs font-medium text-status-error-fg hover:bg-status-error-bg">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-surface-sunken/70 ${className}`} />;
}
