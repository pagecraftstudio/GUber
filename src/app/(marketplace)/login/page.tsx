import { redirect } from 'next/navigation';
import { UiRoot } from '@/ui/UiRoot';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { safeNextPath } from '@/lib/auth/redirect';

export const metadata = { title: 'Log in', robots: { index: false, follow: true } };

/** Customer sign in. Already signed in -> straight to the area that matches the server-resolved role. */
export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw, '');
  const ctx = await getAuthContext();
  if (ctx) redirect(safeNextPath(next, homePathFor(ctx)));
  return <UiRoot authPage="login" nextAfterAuth={next || undefined} />;
}
