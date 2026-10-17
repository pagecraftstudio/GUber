import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthSession, CustomerProfile, CustomerUser, SavedCompanion, SignUpData } from '../../types/auth';
import { NotIntegratedError } from '../runtime';
import { createCustomerBackend } from './customerBackend';

/** Stable, UI-translatable failure reasons. Raw Supabase messages are never shown (they can leak account existence). */
export type AuthFailure =
  | 'invalid_credentials' | 'email_not_confirmed' | 'confirm_email' | 'weak_password' | 'rate_limited' | 'signup_failed' | 'unknown';

export class AuthServiceError extends Error {
  constructor(readonly reason: AuthFailure) {
    super(AUTH_MESSAGES[reason].en);
    this.name = 'AuthServiceError';
  }
}
const AUTH_MESSAGES: Record<AuthFailure, { en: string; ar: string }> = {
  invalid_credentials: { en: 'Incorrect email or password.', ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' },
  email_not_confirmed: { en: 'Please confirm your email first. Check your inbox.', ar: 'يرجى تأكيد بريدك الإلكتروني أولاً. تحقق من صندوق الوارد.' },
  confirm_email: { en: 'Account created. Check your email to confirm it, then sign in.', ar: 'تم إنشاء الحساب. تحقق من بريدك لتأكيده ثم سجّل الدخول.' },
  weak_password: { en: 'That password is too weak. Use at least 8 characters with letters and numbers.', ar: 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل من حروف وأرقام.' },
  rate_limited: { en: 'Too many attempts. Please wait a moment and try again.', ar: 'محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.' },
  signup_failed: { en: 'We could not create the account. Try again or sign in.', ar: 'تعذّر إنشاء الحساب. حاول مرة أخرى أو سجّل الدخول.' },
  unknown: { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.' },
};
export const describeAuthError = (err: unknown, locale: 'ar' | 'en'): string =>
  err instanceof AuthServiceError ? AUTH_MESSAGES[err.reason][locale] : AUTH_MESSAGES.unknown[locale];

interface AuthErrorLike { status?: number; code?: string; message?: string }
function classify(e: AuthErrorLike, fallback: AuthFailure): AuthFailure {
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return 'rate_limited';
  if (e.code === 'weak_password') return 'weak_password';
  if (e.code === 'email_not_confirmed') return 'email_not_confirmed';
  if (e.code === 'invalid_credentials') return 'invalid_credentials';
  return fallback;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Maps a REAL Supabase session. The access token is Supabase's, never generated locally. */
export function toCustomerUser(u: User): CustomerUser {
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id, email: u.email ?? '', fullName: str(m.full_name) || (u.email ?? '').split('@')[0] || '',
    phone: str(m.phone), studentId: str(m.student_id) || undefined, university: str(m.university) || undefined,
    createdAt: u.created_at,
  };
}
export function toAuthSession(s: Session): AuthSession {
  return { user: toCustomerUser(s.user), accessToken: s.access_token, expiresAt: (s.expires_at ?? 0) * 1000, tokenType: 'bearer' };
}

export class RealAuthService {
  private readonly backend;
  constructor(private readonly client: SupabaseClient, private readonly siteUrl: string) {
    this.backend = createCustomerBackend(client);
  }

  onAuthStateChange(cb: (s: AuthSession | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      // Never call back into supabase-js synchronously from this callback (documented deadlock): defer a tick.
      setTimeout(() => cb(session ? toAuthSession(session) : null), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(c: { email: string; password: string }): Promise<{ user: CustomerUser; session: AuthSession }> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: c.email.trim(), password: c.password });
    if (error || !data.session) throw new AuthServiceError(error ? classify(error, 'invalid_credentials') : 'unknown');
    const session = toAuthSession(data.session);
    return { user: session.user, session };
  }

  async signUp(d: SignUpData): Promise<{ user: CustomerUser; session: AuthSession }> {
    const { data, error } = await this.client.auth.signUp({
      email: d.email.trim(), password: d.password,
      options: {
        // user_metadata is client-controlled: display convenience only, NEVER used for authorization.
        data: { full_name: d.fullName.trim(), phone: d.phone.trim(), student_id: d.studentId ?? '', university: d.university ?? '' },
        emailRedirectTo: `${this.siteUrl}/auth/confirm?next=${encodeURIComponent('/app')}`,
      },
    });
    if (error) throw new AuthServiceError(classify(error, 'signup_failed'));
    // With email confirmation on (production default) there is no session yet.
    if (!data.session) throw new AuthServiceError('confirm_email');
    const session = toAuthSession(data.session);
    return { user: session.user, session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new AuthServiceError('unknown');
  }

  async resetPasswordForEmail(email: string): Promise<boolean> {
    const redirectTo = `${this.siteUrl}/auth/confirm?next=${encodeURIComponent('/reset-password')}`;
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error && classify(error, 'unknown') === 'rate_limited') throw new AuthServiceError('rate_limited');
    return true; // identical answer whether or not the account exists
  }

  /** Profile = Supabase user + the caller's OWN customers rows (RLS own_select). No client-supplied user id is trusted. */
  async getCustomerProfile(_userId: string): Promise<CustomerProfile | null> {
    const { data: u } = await this.client.auth.getUser();
    if (!u.user) return null;
    const base = toCustomerUser(u.user);
    const { data: rows } = await this.client
      .from('customers').select('full_name, phone, email, university, student_id, company_id').order('created_at', { ascending: true }).limit(1);
    const c = (rows?.[0] ?? null) as { full_name: string; phone: string; email: string | null; university: string | null; student_id: string | null } | null;
    return {
      id: base.id, fullName: c?.full_name || base.fullName, phone: c?.phone || base.phone, email: base.email,
      studentId: c?.student_id ?? base.studentId, university: c?.university ?? base.university, savedCompanions: [],
    };
  }

  /** Writes go ONLY through update_my_customer (per company). Phone is the verified identity key and is not editable. */
  async updateCustomerProfile(userId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile> {
    const { data: rows, error } = await this.client.from('customers').select('company_id');
    if (error) throw new AuthServiceError('unknown');
    for (const r of (rows ?? []) as Array<{ company_id: string }>) {
      await this.backend.updateMyCustomer(r.company_id, {
        fullName: updates.fullName, email: updates.email, university: updates.university, studentId: updates.studentId,
      });
    }
    const p = await this.getCustomerProfile(userId);
    if (!p) throw new AuthServiceError('unknown');
    return p;
  }

  // No backend table for saved companions yet. Refuse loudly instead of pretending to save.
  async addSavedCompanion(_userId: string, _c: Omit<SavedCompanion, 'id'>): Promise<SavedCompanion> {
    throw new NotIntegratedError('addSavedCompanion');
  }
  async removeSavedCompanion(_userId: string, _id: string): Promise<void> {
    throw new NotIntegratedError('removeSavedCompanion');
  }
}
