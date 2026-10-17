import { AuthCard } from '@/components/ui/AuthCard';
import { Alert } from '@/components/ui/Alert';
import { Field } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { resetPasswordAction } from '@/features/auth/actions';
import { readFlash, type RawSearchParams } from '@/features/auth/search-params';
import { requireUser } from '@/lib/auth/guards';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: RawSearchParams }) {
  await requireUser(); // reached only through a valid email link (recovery session) or an existing session
  const { error } = await readFlash(searchParams);
  return (
    <AuthCard title="Choose a new password" subtitle="Other devices will be signed out.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      <form action={resetPasswordAction} className="space-y-4">
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} hint="10–72 characters." />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} />
        <SubmitButton>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}
