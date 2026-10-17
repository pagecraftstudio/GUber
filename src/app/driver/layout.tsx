import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { requireDriver } from '@/lib/auth/guards';

export const metadata = { title: 'Driver' };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireDriver(); // server gate, re-verified per request; board_ticket re-verifies per scan in Postgres
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{ctx.membership.companyName}</p>
            <p className="text-xs text-slate-500">{ctx.fullName}</p>
          </div>
          <form action={logoutAction} className="w-24"><SubmitButton variant="ghost">Sign out</SubmitButton></form>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{children}</main>
    </div>
  );
}
