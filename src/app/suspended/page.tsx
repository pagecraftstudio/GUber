import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/ui/AuthCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { requireUser } from '@/lib/auth/guards';
import { accessState, homePathFor } from '@/lib/auth/permissions';

export const metadata = { title: 'Account suspended' };

export default async function SuspendedPage() {
  const ctx = await requireUser();
  if (accessState(ctx) !== 'tenant_locked') redirect(homePathFor(ctx));
  return (
    <AuthCard title="Access suspended" subtitle="Your company's account is currently suspended. Please contact MALAKY Studio support.">
      <form action={logoutAction}>
        <SubmitButton variant="ghost">Sign out</SubmitButton>
      </form>
    </AuthCard>
  );
}
