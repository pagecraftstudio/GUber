import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { navFor } from '@/features/platform/nav';
import { requirePlatform } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatform(); // 404 for anyone who is not active platform staff
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">MALAKY Admin</p>
            <p className="truncate text-xs text-slate-400">
              {ctx.fullName} · {ctx.platformRole}
            </p>
          </div>
          <form action={logoutAction} className="w-28 shrink-0">
            <SubmitButton variant="ghost">Sign out</SubmitButton>
          </form>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:gap-8">
        <aside className="md:w-52 md:shrink-0">
          <AdminSidebar items={navFor(ctx.platformRole)} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
