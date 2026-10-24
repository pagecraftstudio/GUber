import Link from 'next/link';
import { AuthCard } from '@/components/ui/AuthCard';
import { Alert } from '@/components/ui/Alert';
import { Field } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { forgotPasswordAction } from '@/features/auth/actions';
import { readFlash, type RawSearchParams } from '@/features/auth/search-params';
import { audienceFrom, loginPathForAudience } from '@/lib/auth/redirect';

export const metadata = { title: 'Reset password' };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: RawSearchParams }) {
  const { error, notice, from } = await readFlash(searchParams);
  const audience = audienceFrom(from);   // 'customer' only when explicitly requested; anything else is the operator flow
  return (
    <AuthCard title="Reset your password" subtitle="Enter your email and we will send you a reset link.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="info">{notice}</Alert> : null}
      <form action={forgotPasswordAction} className="space-y-4">
        <input type="hidden" name="from" value={audience} />
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-500">
        <Link href={loginPathForAudience(audience)} className="underline underline-offset-2 hover:text-slate-800">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
