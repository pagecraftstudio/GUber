import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/ui/AuthCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/features/auth/actions';
import { requireUser } from '@/lib/auth/guards';
import { accessState, homePathFor } from '@/lib/auth/permissions';

export const metadata = { title: 'No access' };

export default async function NoAccessPage() {
  const ctx = await requireUser();
  const state = accessState(ctx);
  if (state !== 'deactivated') redirect(homePathFor(ctx)); // customers have a portal; only deactivated accounts land here
  return (
    <AuthCard
      title="Account deactivated"
      subtitle="This account has been deactivated. Please contact support or your company administrator."
    >
      <form action={logoutAction}>
        <SubmitButton variant="ghost">Sign out</SubmitButton>
      </form>
    </AuthCard>
  );
}
