import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/ui/AuthCard';
import { Alert } from '@/components/ui/Alert';
import { Field } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { loginAction } from '@/features/auth/actions';
import { readFlash, type RawSearchParams } from '@/features/auth/search-params';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { safeNextPath } from '@/lib/auth/redirect';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getAuthContext();
  const { error, notice, next } = await readFlash(searchParams);
  if (ctx) redirect(safeNextPath(next, homePathFor(ctx)));

  return (
    <AuthCard title="Sign in" subtitle="Use the account your company administrator set up for you.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="info">{notice}</Alert> : null}
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={safeNextPath(next, '')} />
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" maxLength={72} />
        <SubmitButton>Sign in</SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-500">
        <Link href="/forgot-password" className="underline underline-offset-2 hover:text-slate-800">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
