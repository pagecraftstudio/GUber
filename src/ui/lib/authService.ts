import type { AuthSession, CustomerProfile, CustomerUser, SavedCompanion, SignUpData } from '../types/auth';
import { getDataMode } from './runtime';
import { AuthServiceError, RealAuthService } from './real/authService.real';
import { getSupabaseBrowser } from './real/supabaseBrowser';
import { getEnv } from '@/lib/env';

/** Contract the UI depends on. Implemented by RealAuthService (Supabase Auth) and, in development only, by the mock. */
export interface AuthApi {
  onAuthStateChange(cb: (s: AuthSession | null) => void): () => void;
  signInWithPassword(c: { email: string; password: string; captchaToken?: string | null }): Promise<{ user: CustomerUser; session: AuthSession }>;
  /** Customers only. Starts a browser redirect to Google; resolves before the page navigates away. Real service only (the mock has no Google). */
  signInWithGoogle?(next?: string): Promise<void>;
  signUp(d: SignUpData): Promise<{ user: CustomerUser; session: AuthSession }>;
  signOut(): Promise<void>;
  resetPasswordForEmail(email: string, captchaToken?: string | null): Promise<boolean>;
  getCustomerProfile(userId: string): Promise<CustomerProfile | null>;
  updateCustomerProfile(userId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile>;
  addSavedCompanion(userId: string, c: Omit<SavedCompanion, 'id'>): Promise<SavedCompanion>;
  removeSavedCompanion(userId: string, id: string): Promise<void>;
}

let real: RealAuthService | undefined;

/**
 * The mock is loaded with a dynamic import that sits behind a build-time constant. In a production build the branch is
 * dead code, so the mock module (fake accounts, plaintext passwords, fake tokens) is not shipped to the browser at all.
 */
const loadMock = (): Promise<AuthApi> =>
  process.env.NODE_ENV === 'production'
    ? Promise.reject(new Error('Mock authentication is not available in production.'))
    : import('./mock/authService.mock').then((m) => m.getMockAuthService());

const impl = async (): Promise<AuthApi> => {
  if (getDataMode() === 'mock') return loadMock();
  return (real ??= new RealAuthService(getSupabaseBrowser(), getEnv().NEXT_PUBLIC_SITE_URL));
};

/** Same name and shape the components already import. Mode is resolved per call (fail closed in production). */
export const authService: AuthApi & { signInWithGoogle(next?: string): Promise<void> } = {
  onAuthStateChange: (cb) => {
    let off: () => void = () => undefined;
    let cancelled = false;
    impl().then((i) => { if (!cancelled) off = i.onAuthStateChange(cb); }).catch(() => cb(null));
    return () => { cancelled = true; off(); };
  },
  signInWithPassword: async (c) => (await impl()).signInWithPassword(c),
  signInWithGoogle: async (next) => {
    const i = await impl();
    if (!i.signInWithGoogle) throw new AuthServiceError('unknown');
    return i.signInWithGoogle(next);
  },
  signUp: async (d) => (await impl()).signUp(d),
  signOut: async () => (await impl()).signOut(),
  resetPasswordForEmail: async (e, captchaToken) => (await impl()).resetPasswordForEmail(e, captchaToken),
  getCustomerProfile: async (id) => (await impl()).getCustomerProfile(id),
  updateCustomerProfile: async (id, u) => (await impl()).updateCustomerProfile(id, u),
  addSavedCompanion: async (id, c) => (await impl()).addSavedCompanion(id, c),
  removeSavedCompanion: async (id, c) => (await impl()).removeSavedCompanion(id, c),
};
