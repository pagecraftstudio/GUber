import { z } from 'zod';
import { pageQuerySchema } from '@/lib/db/pagination';
import { emailSchema } from '@/lib/validation/common';

/**
 * No company id: the RPC pins the invite to the caller's own company. `roleKey` is only shape-checked, because
 * roles are database data (extensible); an unknown key is rejected by the RPC (`unknown_role`).
 */
export const inviteCreateSchema = z.strictObject({
  email: emailSchema,
  roleKey: z.string().regex(/^[a-z][a-z_]{1,39}$/, 'invalid_role'),
});
export type InviteCreate = z.output<typeof inviteCreateSchema>;

export const memberListSchema = pageQuerySchema;

export const inviteListSchema = pageQuerySchema.extend({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']).optional(),
});
export type InviteListQuery = z.output<typeof inviteListSchema>;

/** Shape returned by create_invite(). Parsed at the trust boundary. */
export const createInviteResultSchema = z.array(z.object({ invite_id: z.guid(), token: z.string().min(20), expires_at: z.string() })).min(1);
