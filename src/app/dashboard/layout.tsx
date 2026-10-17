import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { requireTenant } from '@/lib/auth/guards';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant(); // real gate: re-verified against the database on every request
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{ctx.membership.companyName}</p>
            <p className="text-xs text-slate-500">
              {ctx.fullName} · {ctx.membership.roleKey}
            </p>
          </div>
          <form action={logoutAction} className="w-28">
            <SubmitButton variant="ghost">Sign out</SubmitButton>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
