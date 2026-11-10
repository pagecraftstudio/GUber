import type { ReactNode } from 'react';
import { Logo } from '../brand/Logo';
import { SubmitButton } from '../primitives/Button';
import { SkipLink } from './SkipLink';
import { SHELL_TEXT } from './text';

/**
 * Driver shell: a single top bar, no sidebar, 44px touch targets, safe-area aware for phones. Server component.
 * Boarding screens are English only today, so the chrome is too.
 */
export function DriverShellMasar({ companyName, driverName, logoutAction, children }: { companyName: string; driverName: string; logoutAction: () => void; children: ReactNode }) {
  const st = SHELL_TEXT.en;
  return (
    <div className="min-h-screen bg-surface-page text-ink-primary">
      <SkipLink label={st.skip} />
      <header className="sticky top-0 z-20 border-b border-line-default bg-surface-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <Logo size="sm" tone="auto" />
            <p className="mt-1 truncate text-[13px] text-ink-secondary">{companyName} · {driverName}</p>
          </div>
          <form action={logoutAction}><SubmitButton variant="secondary" size="lg">{st.signOut}</SubmitButton></form>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-md px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none">{children}</main>
    </div>
  );
}
