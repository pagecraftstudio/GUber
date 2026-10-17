export interface CustomerUser {
  id: string; // Supabase Auth UUID
  email: string;
  fullName: string;
  phone: string;
  studentId?: string;
  university?: string;
  createdAt: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: CustomerUser;
  accessToken: string; // Provisional Supabase JWT simulation
  expiresAt: number;
  tokenType: 'bearer';
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  studentId?: string;
  university?: string;
  preferredPickupStopId?: string;
  savedCompanions?: SavedCompanion[];
}

export interface SavedCompanion {
  id: string;
  name: string;
  phone: string;
  studentId?: string;
  relationship?: string;
}

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  studentId?: string;
  university?: string;
}
