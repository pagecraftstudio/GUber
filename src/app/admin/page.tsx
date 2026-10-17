import { requirePlatform } from '@/lib/auth/guards';

export const metadata = { title: 'Admin' };

// Placeholder: the real Super Admin is Phase 10.
export default async function AdminPage() {
  const ctx = await requirePlatform();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Platform admin</h1>
      <p className="text-sm text-slate-600">Signed in as {ctx.email} with platform role <code className="rounded bg-slate-100 px-1.5 py-0.5">{ctx.platformRole}</code>.</p>
    </div>
  );
}
