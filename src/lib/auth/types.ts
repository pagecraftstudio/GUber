import { z } from 'zod';

export const PLATFORM_ROLES = ['super_admin', 'support', 'billing'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export type CompanyStatus = 'trial' | 'active' | 'suspended' | 'cancelled' | 'deleted';

export type Membership = {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyStatus: CompanyStatus;
  memberStatus: 'active' | 'suspended';
  /** Informational / UI labelling only. Authorization must use `can()` on `permissions`. */
  roleKey: string;
  /** Effective permissions from the DB. Empty when the company or membership is suspended. */
  permissions: string[];
};

export type AuthContext = {
  userId: string;
  email: string;
  fullName: string;
  locale: 'ar' | 'en';
  isActive: boolean;
  platformRole: PlatformRole | null;
  membership: Membership | null;
};

/** Shape returned by the `my_context()` RPC (migration 0007). Parsed at the trust boundary. */
export const rawContextSchema = z.object({
  user_id: z.uuid(),
  email: z.string(),
  full_name: z.string(),
  locale: z.enum(['ar', 'en']),
  is_active: z.boolean(),
  platform_role: z.enum(PLATFORM_ROLES).nullable(),
  membership: z
    .object({
      company_id: z.uuid(),
      company_name: z.string(),
      company_slug: z.string(),
      company_status: z.enum(['trial', 'active', 'suspended', 'cancelled', 'deleted']),
      member_status: z.enum(['active', 'suspended']),
      role_key: z.string(),
      permissions: z.array(z.string()),
    })
    .nullable(),
});

export type RawContext = z.infer<typeof rawContextSchema>;

export function toAuthContext(raw: RawContext): AuthContext {
  return {
    userId: raw.user_id,
    email: raw.email,
    fullName: raw.full_name,
    locale: raw.locale,
    isActive: raw.is_active,
    platformRole: raw.platform_role,
    membership: raw.membership && {
      companyId: raw.membership.company_id,
      companyName: raw.membership.company_name,
      companySlug: raw.membership.company_slug,
      companyStatus: raw.membership.company_status,
      memberStatus: raw.membership.member_status,
      roleKey: raw.membership.role_key,
      permissions: raw.membership.permissions,
    },
  };
}
