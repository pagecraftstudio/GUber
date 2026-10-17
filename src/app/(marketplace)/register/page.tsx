import { redirect } from 'next/navigation';
import { UiRoot } from '@/ui/UiRoot';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';

export const metadata = { title: 'Create account', robots: { index: false, follow: true } };

/** Customer registration (Supabase Auth signUp, same implementation as the in-app modal). */
export default async function CustomerRegisterPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect(homePathFor(ctx));
  return <UiRoot authPage="register" />;
}
