import { confirmActingWriteAction, exitActingAction } from '@/features/acting/actions';
import { Button } from '@/ds/primitives/Button';

const hhmm = (iso: string): string => `${new Date(iso).toISOString().slice(11, 16)} UTC`;

export interface ActingBannerProps {
  companyName: string;
  companyStatus: string;
  mode: 'read' | 'write';
  expiresAt: string;
  /** UI only: super_admin may switch to editing. support never can (Postgres refuses it too). */
  canWrite: boolean;
}

/**
 * Shown on every dashboard page while platform staff acts as a company. Server component with plain form posts, so it works without JavaScript.
 * It says who you are acting as, whether you can change anything, and when the session ends (30 minutes, never extended).
 * Turning editing on is a second explicit step with the consequence written out.
 */
export function ActingBanner({ companyName, companyStatus, mode, expiresAt, canWrite }: ActingBannerProps) {
  const locked = companyStatus !== 'trial' && companyStatus !== 'active';
  const editing = mode === 'write';
  return (
    <div role="region" aria-label="Acting as a company" className="sticky top-0 z-30 mb-5 rounded-ds-md border border-status-warning-fg bg-status-warning-bg px-4 py-3 text-sm text-ink-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0">
          <span className="font-medium">You are acting as <bdi>{companyName}</bdi>.</span>{' '}
          {editing ? 'Editing is on: your changes are recorded under your name.' : locked ? 'This company is suspended or cancelled: you can look, but not change anything.' : 'Read-only.'}{' '}
          <span className="text-ink-secondary">Ends at {hhmm(expiresAt)}.</span>
        </p>
        <form action={exitActingAction}><Button type="submit" variant="secondary">Exit</Button></form>
      </div>
      {!editing && !locked && canWrite ? (
        <details className="mt-2">
          <summary className="inline-flex min-h-9 cursor-pointer items-center font-medium underline underline-offset-2">Turn on editing</summary>
          <form action={confirmActingWriteAction} className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-ink-secondary">Everything you change is saved for real and recorded under your name until this session ends. Users, domains and publishing stay off-limits, and nothing can be deleted.</p>
            <Button type="submit" variant="primary">Confirm editing</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
