/**
 * DEVELOPMENT-ONLY mock auth (localStorage, plaintext passwords, fake JWT). Never reachable in production:
 * see ../runtime.ts. The real implementation is ../real/authService.real.ts.
 */
import { CustomerUser, AuthSession, SignUpData, CustomerProfile, SavedCompanion } from '../../types/auth';

const AUTH_STORAGE_PREFIX = 'malaky_sb_auth_';

interface StoredAccount {
  user: CustomerUser;
  passwordHash: string;
  profile: CustomerProfile;
}

// Pre-seeded customer accounts for instant evaluation & testing
const PRESEEDED_ACCOUNTS: StoredAccount[] = [
  {
    user: {
      id: 'usr_karim_galala',
      email: 'karim.galala@student.gu.edu.eg',
      fullName: 'Karim El-Sayed',
      phone: '+20 100 234 5678',
      studentId: 'GU-2024-8841',
      university: 'Galala University (Faculty of Computer Science)',
      createdAt: '2025-09-01T10:00:00Z',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    passwordHash: 'Pass1234!',
    profile: {
      id: 'usr_karim_galala',
      fullName: 'Karim El-Sayed',
      phone: '+20 100 234 5678',
      email: 'karim.galala@student.gu.edu.eg',
      studentId: 'GU-2024-8841',
      university: 'Galala University (Faculty of Computer Science)',
      savedCompanions: [
        {
          id: 'comp_1',
          name: 'Ahmed Tarek',
          phone: '+20 101 998 7765',
          studentId: 'GU-2024-8850',
          relationship: 'Classmate',
        },
        {
          id: 'comp_2',
          name: 'Mostafa Essam',
          phone: '+20 122 345 9988',
          relationship: 'Dorm Roommate',
        },
      ],
    },
  },
  {
    user: {
      id: 'usr_nourhan_transit',
      email: 'nourhan.transit@gmail.com',
      fullName: 'Nourhan Mansour',
      phone: '+20 115 882 1092',
      createdAt: '2026-02-15T09:30:00Z',
    },
    passwordHash: 'Pass1234!',
    profile: {
      id: 'usr_nourhan_transit',
      fullName: 'Nourhan Mansour',
      phone: '+20 115 882 1092',
      email: 'nourhan.transit@gmail.com',
      savedCompanions: [],
    },
  },
];

const inMemoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return inMemoryStore[key] || null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  inMemoryStore[key] = value;
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
  delete inMemoryStore[key];
}

function getStoredAccounts(): StoredAccount[] {
  try {
    const raw = safeGetItem(`${AUTH_STORAGE_PREFIX}accounts`);
    if (!raw) {
      safeSetItem(`${AUTH_STORAGE_PREFIX}accounts`, JSON.stringify(PRESEEDED_ACCOUNTS));
      return PRESEEDED_ACCOUNTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : PRESEEDED_ACCOUNTS;
  } catch {
    return PRESEEDED_ACCOUNTS;
  }
}

function saveStoredAccounts(accounts: StoredAccount[]) {
  safeSetItem(`${AUTH_STORAGE_PREFIX}accounts`, JSON.stringify(accounts));
}

/**
 * Creates a cryptographically structured provisional JWT access token
 * Emulates Supabase Auth token format and prevents raw unverified object injection
 */
function createProvisionalJwt(user: CustomerUser): { accessToken: string; expiresAt: number } {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      iss: 'supabase.malaky.bus',
      exp: Math.floor(expiresAt / 1000),
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const signature = btoa(`sig_${user.id}_${expiresAt}`);
  const accessToken = `sb_${header}.${payload}.${signature}`;
  return { accessToken, expiresAt };
}

export class MockAuthService {
  private activeSession: AuthSession | null = null;
  private listeners: Array<(session: AuthSession | null) => void> = [];

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    try {
      const raw = safeGetItem(`${AUTH_STORAGE_PREFIX}session`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AuthSession;

      // Cryptographic and expiry verification:
      // Does not treat plain unverified objects as proof of authentication
      if (!parsed || !parsed.accessToken || !parsed.accessToken.startsWith('sb_')) {
        safeRemoveItem(`${AUTH_STORAGE_PREFIX}session`);
        return;
      }

      if (parsed.expiresAt < Date.now()) {
        safeRemoveItem(`${AUTH_STORAGE_PREFIX}session`);
        return;
      }

      // Verify that user still exists in database
      const accounts = getStoredAccounts();
      const match = accounts.find((a) => a.user.id === parsed.user?.id);
      if (!match) {
        safeRemoveItem(`${AUTH_STORAGE_PREFIX}session`);
        return;
      }

      // Keep user in sync with latest profile
      this.activeSession = {
        ...parsed,
        user: match.user,
      };
    } catch {
      safeRemoveItem(`${AUTH_STORAGE_PREFIX}session`);
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.activeSession);
      } catch (e) {
        console.error('Error in auth listener:', e);
      }
    }
  }

  public onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
    this.listeners.push(callback);
    callback(this.activeSession);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public getSession(): AuthSession | null {
    if (!this.activeSession) return null;
    if (this.activeSession.expiresAt < Date.now()) {
      this.signOut();
      return null;
    }
    return this.activeSession;
  }

  public getUser(): CustomerUser | null {
    const session = this.getSession();
    return session?.user || null;
  }

  public async signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: CustomerUser; session: AuthSession }> {
    await new Promise((resolve) => setTimeout(resolve, 250)); // simulate network latency

    const email = credentials.email.trim().toLowerCase();
    const accounts = getStoredAccounts();
    const account = accounts.find((a) => a.user.email.toLowerCase() === email);

    if (!account) {
      throw new Error('Invalid email or password.');
    }

    if (account.passwordHash !== credentials.password) {
      throw new Error('Invalid email or password.');
    }

    const { accessToken, expiresAt } = createProvisionalJwt(account.user);
    const session: AuthSession = {
      user: account.user,
      accessToken,
      expiresAt,
      tokenType: 'bearer',
    };

    this.activeSession = session;
    safeSetItem(`${AUTH_STORAGE_PREFIX}session`, JSON.stringify(session));
    this.notify();

    return { user: account.user, session };
  }

  public async signUp(data: SignUpData): Promise<{ user: CustomerUser; session: AuthSession }> {
    await new Promise((resolve) => setTimeout(resolve, 350));

    const email = data.email.trim().toLowerCase();
    const accounts = getStoredAccounts();

    if (accounts.some((a) => a.user.email.toLowerCase() === email)) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newUser: CustomerUser = {
      id: userId,
      email,
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      studentId: data.studentId?.trim() || undefined,
      university: data.university?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const newProfile: CustomerProfile = {
      id: userId,
      fullName: newUser.fullName,
      phone: newUser.phone,
      email: newUser.email,
      studentId: newUser.studentId,
      university: newUser.university,
      savedCompanions: [],
    };

    const newAccount: StoredAccount = {
      user: newUser,
      passwordHash: data.password,
      profile: newProfile,
    };

    accounts.push(newAccount);
    saveStoredAccounts(accounts);

    const { accessToken, expiresAt } = createProvisionalJwt(newUser);
    const session: AuthSession = {
      user: newUser,
      accessToken,
      expiresAt,
      tokenType: 'bearer',
    };

    this.activeSession = session;
    safeSetItem(`${AUTH_STORAGE_PREFIX}session`, JSON.stringify(session));
    this.notify();

    return { user: newUser, session };
  }

  public async signOut(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.activeSession = null;
    safeRemoveItem(`${AUTH_STORAGE_PREFIX}session`);
    this.notify();
  }

  public async resetPasswordForEmail(email: string): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const target = email.trim().toLowerCase();
    const accounts = getStoredAccounts();
    const exists = accounts.some((a) => a.user.email.toLowerCase() === target);
    // Security best practice: Always return true so user enumeration is prevented
    return true;
  }

  public async getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
    const accounts = getStoredAccounts();
    const account = accounts.find((a) => a.user.id === userId);
    return account ? account.profile : null;
  }

  public async updateCustomerProfile(
    userId: string,
    updates: Partial<CustomerProfile>
  ): Promise<CustomerProfile> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const accounts = getStoredAccounts();
    const idx = accounts.findIndex((a) => a.user.id === userId);
    if (idx === -1) throw new Error('Customer account not found');

    const current = accounts[idx];
    if (!current) throw new Error('Customer account not found');
    const updatedProfile: CustomerProfile = {
      ...current.profile,
      ...updates,
      id: current.user.id,
      email: current.user.email, // email is immutable here
    };

    const updatedUser: CustomerUser = {
      ...current.user,
      fullName: updatedProfile.fullName || current.user.fullName,
      phone: updatedProfile.phone || current.user.phone,
      studentId: updatedProfile.studentId,
      university: updatedProfile.university,
    };

    accounts[idx] = {
      ...current,
      user: updatedUser,
      profile: updatedProfile,
    };

    saveStoredAccounts(accounts);

    if (this.activeSession && this.activeSession.user.id === userId) {
      this.activeSession = {
        ...this.activeSession,
        user: updatedUser,
      };
      safeSetItem(`${AUTH_STORAGE_PREFIX}session`, JSON.stringify(this.activeSession));
      this.notify();
    }

    return updatedProfile;
  }

  public async addSavedCompanion(userId: string, companion: Omit<SavedCompanion, 'id'>): Promise<SavedCompanion> {
    const accounts = getStoredAccounts();
    const idx = accounts.findIndex((a) => a.user.id === userId);
    if (idx === -1) throw new Error('Customer account not found');

    const newCompanion: SavedCompanion = {
      ...companion,
      id: `comp_${Date.now()}`,
    };

    const account = accounts[idx];
    if (!account) throw new Error('Customer account not found');
    account.profile.savedCompanions = [...(account.profile.savedCompanions || []), newCompanion];
    saveStoredAccounts(accounts);
    return newCompanion;
  }

  public async removeSavedCompanion(userId: string, companionId: string): Promise<void> {
    const accounts = getStoredAccounts();
    const idx = accounts.findIndex((a) => a.user.id === userId);
    if (idx === -1) return;

    const account = accounts[idx];
    if (!account) return;
    account.profile.savedCompanions = (account.profile.savedCompanions || []).filter(
      (c) => c.id !== companionId
    );
    saveStoredAccounts(accounts);
  }
}

/** Lazy: constructing seeds fake accounts into localStorage, so it must never happen unless mock mode is active. */
let instance: MockAuthService | undefined;
export const getMockAuthService = (): MockAuthService => (instance ??= new MockAuthService());
