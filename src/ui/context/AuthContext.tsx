import React, { createContext, useContext, useState, useEffect } from 'react';
import { CustomerUser, AuthSession, CustomerProfile, SignUpData } from '../types/auth';
import { authService } from '../lib/authService';

export type AuthModalMode = 'login' | 'register' | 'forgot_password';

interface AuthContextType {
  user: CustomerUser | null;
  session: AuthSession | null;
  profile: CustomerProfile | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  loading: boolean;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  updateProfile: (updates: Partial<CustomerProfile>) => Promise<CustomerProfile>;
  reloadProfile: () => Promise<void>;
  // Auth modal management
  isAuthModalOpen: boolean;
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');

  const reloadProfile = async () => {
    if (session?.user?.id) {
      const p = await authService.getCustomerProfile(session.user.id);
      setProfile(p);
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange(async (newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        const p = await authService.getCustomerProfile(newSession.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (credentials: { email: string; password: string }) => {
    const res = await authService.signInWithPassword(credentials);
    setSession(res.session);
    const p = await authService.getCustomerProfile(res.user.id);
    setProfile(p);
    setIsAuthModalOpen(false);
  };

  const signUp = async (data: SignUpData) => {
    const res = await authService.signUp(data);
    setSession(res.session);
    const p = await authService.getCustomerProfile(res.user.id);
    setProfile(p);
    setIsAuthModalOpen(false);
  };

  const signOut = async () => {
    await authService.signOut();
    setSession(null);
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    return await authService.resetPasswordForEmail(email);
  };

  const updateProfile = async (updates: Partial<CustomerProfile>) => {
    if (!session?.user?.id) throw new Error('Not authenticated');
    const updated = await authService.updateCustomerProfile(session.user.id, updates);
    setProfile(updated);
    return updated;
  };

  const openAuthModal = (mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        session,
        profile,
        isAuthenticated: !!session?.user,
        isGuest: !session?.user,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
        reloadProfile,
        isAuthModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
