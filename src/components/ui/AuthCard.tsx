import { Logo } from '@/ds/brand/Logo';
import { DsLangProvider } from '@/ds/lang';
import { isSurfaceScoped, type DsSurface } from '@/ds/scope';
import { DsFlagProvider } from '@/ds/shell/flag';
import { PoweredByMalaky } from '@/ds/shell/PoweredByMalaky';

/**
 * Frame for every sign-in, reset, invite and "no access" page. `surface` picks which allow-list entry flips it:
 * "auth" for sign-in flows, "system" for account-state pages (suspended, deactivated). Presentation only; the forms and actions inside are untouched.
 * When flipped it also provides the flag, so Field, Alert and SubmitButton (client components) draw themselves in the MASAR look.
 */
export function AuthCard({ title, subtitle, surface = 'auth', children }: { title: string; subtitle?: string; surface?: Extract<DsSurface, 'auth' | 'system'>; children: React.ReactNode }) {
  if (!isSurfaceScoped(surface, null)) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <header className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">MASAR</p>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
          </header>
          {children}
        </div>
      </main>
    );
  }
  return (
    <div data-ds="masar" style={{ display: 'contents' }}>
      <DsFlagProvider value={true}>
        <DsLangProvider value="en">
          <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-page px-4 py-12 text-ink-primary">
            <Logo size="lg" tone="onLight" />
            <div className="w-full max-w-md space-y-6 rounded-ds-md border border-line-default bg-surface-card p-6 sm:p-8">
              <header className="space-y-1.5">
                <h1 className="text-2xl font-medium text-ink-primary">{title}</h1>
                {subtitle ? <p className="text-sm text-ink-secondary">{subtitle}</p> : null}
              </header>
              {children}
            </div>
            <p className="text-[13px] text-ink-muted"><PoweredByMalaky text="Powered by MALAKY Studio" /></p>
          </main>
        </DsLangProvider>
      </DsFlagProvider>
    </div>
  );
}
