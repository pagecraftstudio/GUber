export type MemberStatus = 'active' | 'suspended';
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

type RoleEmbed = { key: string; name: string } | null;

export type MemberRow = {
  id: string;
  user_id: string;
  status: MemberStatus;
  created_at: string;
  role: RoleEmbed;
  profile: { full_name: string; email: string; phone: string | null } | null;
};
export type Member = {
  /** company_users.id (the membership), not the auth user id. */
  id: string;
  userId: string;
  status: MemberStatus;
  roleKey: string | null;
  roleName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
};
export const MEMBER_SELECT = 'id,user_id,status,created_at,role:roles(key,name),profile:profiles!user_id(full_name,email,phone)';
export const toMember = (r: MemberRow): Member => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  roleKey: r.role?.key ?? null,
  roleName: r.role?.name ?? null,
  fullName: r.profile?.full_name ?? null,
  email: r.profile?.email ?? null,
  phone: r.profile?.phone ?? null,
  createdAt: r.created_at,
});

export type InviteRow = {
  id: string;
  email: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
  role: RoleEmbed;
};
export type Invite = {
  id: string;
  email: string;
  /** `pending` rows past their expiry are reported as `expired` (the DB flips the flag lazily). */
  status: InviteStatus;
  roleKey: string | null;
  roleName: string | null;
  expiresAt: string;
  createdAt: string;
};
export const INVITE_SELECT = 'id,email,status,expires_at,created_at,role:roles(key,name)';
export const toInvite =
  (now: Date) =>
  (r: InviteRow): Invite => ({
    id: r.id,
    email: r.email,
    status: r.status === 'pending' && Date.parse(r.expires_at) <= now.getTime() ? 'expired' : r.status,
    roleKey: r.role?.key ?? null,
    roleName: r.role?.name ?? null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  });

export type RoleRow = { key: string; name: string; description: string | null };
export type Role = { key: string; name: string; description: string | null };
export const ROLE_SELECT = 'key,name,description';
export const toRole = (r: RoleRow): Role => ({ key: r.key, name: r.name, description: r.description });

/** The raw token exists ONLY in this return value. It is never stored (the DB keeps its sha256) or logged. */
export type CreatedInvite = { inviteId: string; token: string; expiresAt: string };
