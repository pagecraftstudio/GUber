import { redirect } from 'next/navigation';
import { UiRoot } from '@/ui/UiRoot';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { safeNextPath } from '@/lib/auth/redirect';

export const metadata = { title: 'Create account', robots: { index: false, follow: true } };

/** Customer registration (Supabase Auth signUp, same implementation as the in-app modal). `?next=` is allow-listed, like the login page. */
export default async function CustomerRegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw, '');
  const ctx = await getAuthContext();
  if (ctx) redirect(safeNextPath(next, homePathFor(ctx)));
  return <UiRoot authPage="register" nextAfterAuth={next || undefined} />;
}
