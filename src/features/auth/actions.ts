'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { loadContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { safeNextPath } from '@/lib/auth/redirect';
import { COMPANY_LOGIN_PATH } from '@/lib/auth/paths';
import { getEnv } from '@/lib/env';
import { requireUser } from '@/lib/auth/guards';
import {
  forgotPasswordSchema,
  inviteSignupSchema,
  inviteTokenSchema,
  loginSchema,
  resetPasswordSchema,
} from '@/lib/validation/auth';

/**
 * Server Actions for authentication. Next.js verifies Origin vs Host on every Server Action POST (CSRF defence).
 * Rules: validate with zod, return generic errors (no account enumeration), never trust a client-supplied
 * company id (there is none here), never log credentials.
 */

function field(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function url(path: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

type AuthErrorLike = { status?: number; code?: string } | null;

function authErrorCode(error: AuthErrorLike): string {
  if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 'rate_limited';
  if (error?.code === 'email_not_confirmed') return 'email_not_confirmed';
  return 'invalid_credentials';
}

// ---------------------------------------------------------------- login / logout

export async function loginAction(formData: FormData): Promise<void> {
  const next = safeNextPath(field(formData, 'next'), '');
  const parsed = loginSchema.safeParse({ email: field(formData, 'email'), password: field(formData, 'password') });
  if (!parsed.success) redirect(url(COMPANY_LOGIN_PATH, { error: 'invalid_credentials', next }));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(url(COMPANY_LOGIN_PATH, { error: authErrorCode(error), next }));

  const ctx = await loadContext(supabase);
  if (!ctx) {
    await supabase.auth.signOut({ scope: 'local' });
    redirect(url(COMPANY_LOGIN_PATH, { error: 'login_failed' }));
  }
  redirect(safeNextPath(next, homePathFor(ctx)));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect(COMPANY_LOGIN_PATH);
}

// ---------------------------------------------------------------- password reset

export async function forgotPasswordAction(formData: FormData): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse({ email: field(formData, 'email') });
  if (!parsed.success) redirect(url('/forgot-password', { error: 'invalid_form' }));

  const supabase = await createClient();
  const redirectTo = `${getEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent('/reset-password')}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit')) {
    redirect(url('/forgot-password', { error: 'rate_limited' }));
  }
  // Same response whether or not the account exists.
  redirect(url('/forgot-password', { notice: 'reset_sent' }));
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const ctx = await requireUser(); // arrives with a recovery session from /auth/confirm
  const parsed = resetPasswordSchema.safeParse({ password: field(formData, 'password'), confirm: field(formData, 'confirm') });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === 'mismatch');
    redirect(url('/reset-password', { error: mismatch ? 'password_mismatch' : 'weak_password' }));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect(url('/reset-password', { error: error.code === 'weak_password' ? 'weak_password' : 'generic' }));

  await supabase.auth.signOut({ scope: 'others' }); // a reset must kill every other session
  redirect(url(homePathFor(ctx), { notice: 'password_updated' }));
}

// ---------------------------------------------------------------- invitations

/** Returns an error code, or null on success. */
async function acceptInvite(supabase: SupabaseClient, token: string): Promise<string | null> {
  const { error } = await supabase.rpc('accept_invite', { p_token: token });
  if (!error) return null;
  if (error.code === '23505') return 'already_member';
  if (error.code === '53400') return 'plan_limit';
  if (error.code === '42501') return 'no_subscription';
  return 'invalid_invite'; // P0001 and anything unexpected: one generic message
}

export async function signUpWithInviteAction(formData: FormData): Promise<void> {
  const token = field(formData, 'token');
  if (!inviteTokenSchema.safeParse(token).success) redirect(url(COMPANY_LOGIN_PATH, { error: 'invalid_invite' }));
  const invitePath = `/invite/${token}`;

  const parsed = inviteSignupSchema.safeParse({
    token,
    fullName: field(formData, 'fullName'),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === 'password');
    redirect(url(invitePath, { error: weak ? 'weak_password' : 'invalid_form' }));
  }

  const supabase = await createClient();
  // The email comes from the invitation itself, never from the form: the account is created for the invited address.
  const { data: preview } = await supabase.rpc('preview_invite', { p_token: token });
  const invite = Array.isArray(preview) ? (preview[0] as { email?: string } | undefined) : undefined;
  if (!invite?.email) redirect(url(invitePath, { error: 'invalid_invite' }));

  const emailRedirectTo = `${getEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(invitePath)}`;
  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName }, emailRedirectTo },
  });
  if (error) {
    const code = error.code === 'weak_password' ? 'weak_password' : error.status === 429 ? 'rate_limited' : 'signup_failed';
    redirect(url(invitePath, { error: code }));
  }

  if (data.session) {
    // Project has email confirmation turned off (not recommended): the user is already signed in.
    const failure = await acceptInvite(supabase, token);
    redirect(failure ? url(invitePath, { error: failure }) : '/dashboard');
  }
  redirect(url(invitePath, { notice: 'check_email' }));
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = field(formData, 'token');
  if (!inviteTokenSchema.safeParse(token).success) redirect(url(COMPANY_LOGIN_PATH, { error: 'invalid_invite' }));
  const invitePath = `/invite/${token}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(url(COMPANY_LOGIN_PATH, { next: invitePath }));

  const failure = await acceptInvite(supabase, token);
  redirect(failure ? url(invitePath, { error: failure }) : '/dashboard');
}
