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
  if (state !== 'no_access' && state !== 'deactivated') redirect(homePathFor(ctx));
  return (
    <AuthCard
      title={state === 'deactivated' ? 'Account deactivated' : 'No company access'}
      subtitle={
        state === 'deactivated'
          ? 'This account has been deactivated. Please contact your company administrator.'
          : 'Your account is not linked to a company yet. Open the invitation link your administrator sent you.'
      }
    >
      <form action={logoutAction}>
        <SubmitButton variant="ghost">Sign out</SubmitButton>
      </form>
    </AuthCard>
  );
}
