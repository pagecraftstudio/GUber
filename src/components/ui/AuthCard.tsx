import { Logo } from '@/ds/brand/Logo';
import { DsLangProvider } from '@/ds/lang';
import { PoweredByMalaky } from '@/ds/shell/PoweredByMalaky';

/**
 * Frame for every sign-in, reset, invite and "no access" page. Presentation only; the forms and actions inside are untouched.
 */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; surface?: 'auth' | 'system'; children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
