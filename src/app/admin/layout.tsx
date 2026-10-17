import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { requirePlatform } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatform(); // 404 for anyone who is not active platform staff
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">MALAKY Admin</p>
            <p className="text-xs text-slate-400">
              {ctx.fullName} · {ctx.platformRole}
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
