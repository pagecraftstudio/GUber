import Link from 'next/link';
import { AuthCard } from '@/components/ui/AuthCard';
import { Alert } from '@/components/ui/Alert';
import { Field } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { acceptInviteAction, logoutAction, signUpWithInviteAction } from '@/features/auth/actions';
import { readFlash, type RawSearchParams } from '@/features/auth/search-params';
import { getAuthContext } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { inviteTokenSchema } from '@/lib/validation/auth';

export const metadata = { title: 'Join your company', robots: { index: false, follow: false } };

type Preview = { company_name: string; role_name: string; email: string };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: RawSearchParams;
}) {
  const { token } = await params;
  const { error, notice } = await readFlash(searchParams);

  const invalid = (
    <AuthCard title="Invitation not valid">
      <Alert kind="error">This invitation is invalid, expired, or was already used. Ask your company administrator for a new one.</Alert>
      <Link href="/login" className="block text-center text-sm underline underline-offset-2">
        Go to sign in
      </Link>
    </AuthCard>
  );
  if (!inviteTokenSchema.safeParse(token).success) return invalid;

  const supabase = await createClient();
  const { data } = await supabase.rpc('preview_invite', { p_token: token });
  const invite = Array.isArray(data) ? (data[0] as Preview | undefined) : undefined;
  if (!invite) return invalid;

  const ctx = await getAuthContext();
  const heading = `Join ${invite.company_name}`;
  const subtitle = `You were invited as ${invite.role_name}.`;

  // Signed in as the invited person -> one click to accept.
  if (ctx && ctx.email.toLowerCase() === invite.email.toLowerCase()) {
    return (
      <AuthCard title={heading} subtitle={subtitle}>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <form action={acceptInviteAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <SubmitButton>Accept invitation</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  // Signed in as somebody else.
  if (ctx) {
    return (
      <AuthCard title={heading} subtitle={subtitle}>
        <Alert kind="error">You are signed in as {ctx.email}, but this invitation is for a different email address. Sign out and continue with the invited address.</Alert>
        <form action={logoutAction}>
          <SubmitButton variant="ghost">Sign out</SubmitButton>
        </form>
      </AuthCard>
    );
  }

  // Signed out: create the account for the invited address (email is fixed by the invitation).
  return (
    <AuthCard title={heading} subtitle={subtitle}>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {notice ? <Alert kind="info">{notice}</Alert> : null}
      <form action={signUpWithInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Email" name="email" type="email" defaultValue={invite.email} readOnly hint="Set by the invitation." />
        <Field label="Full name" name="fullName" autoComplete="name" maxLength={100} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} hint="10–72 characters." />
        <SubmitButton>Create account</SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="underline underline-offset-2 hover:text-slate-800">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
