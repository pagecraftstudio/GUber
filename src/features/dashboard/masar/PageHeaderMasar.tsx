import type { ReactNode } from 'react';

/** Title names the context (Appendix C): "Trips", "Bookings", not a greeting. One primary action at most, at the end. */
export function PageHeaderMasar({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-medium text-ink-primary">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
