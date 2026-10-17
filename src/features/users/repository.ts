import { mapDbError } from '@/lib/db/map-error';
import { rangeFor, type Page, type PageParams } from '@/lib/db/pagination';
import { asRows, expectList, expectPage } from '@/lib/db/query';
import { AppError } from '@/lib/errors';
import type { TenantServiceContext } from '@/lib/service/context';
import { createInviteResultSchema, type InviteCreate, type InviteListQuery } from './schema';
import {
  INVITE_SELECT,
  MEMBER_SELECT,
  ROLE_SELECT,
  toInvite,
  toMember,
  toRole,
  type CreatedInvite,
  type Invite,
  type InviteRow,
  type Member,
  type MemberRow,
  type Role,
  type RoleRow,
} from './types';

export type UserRepository = {
  listMembers(ctx: TenantServiceContext, p: PageParams): Promise<Page<Member>>;
  listInvites(ctx: TenantServiceContext, q: InviteListQuery): Promise<Page<Invite>>;
  listRoles(ctx: TenantServiceContext): Promise<Role[]>;
  createInvite(ctx: TenantServiceContext, input: InviteCreate): Promise<CreatedInvite>;
  revokeInvite(ctx: TenantServiceContext, inviteId: string): Promise<void>;
};

/**
 * Reads go through RLS (users.read). Writes go ONLY through the Phase 3 RPCs: no client can write company_users
 * or company_invites directly (0006, D2), which is what stops a manager from promoting themselves to owner.
 */
export const userRepository: UserRepository = {
  async listMembers(ctx, p) {
    const { from, to } = rangeFor(p);
    return expectPage<MemberRow, Member>(
      asRows(
        await ctx.db
          .from('company_users')
          .select(MEMBER_SELECT, { count: 'exact' })
          .eq('company_id', ctx.companyId)
          .order('created_at')
          .order('id')
          .range(from, to),
      ),
      toMember,
      p,
    );
  },

  async listInvites(ctx, q) {
    let query = ctx.db.from('company_invites').select(INVITE_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status === 'expired') {
      // expiry is lazy in the DB: an expired invite is either flagged `expired` or still `pending` past its time
      query = query.or(`status.eq.expired,and(status.eq.pending,expires_at.lte.${new Date().toISOString()})`);
    } else if (q.status === 'pending') {
      query = query.eq('status', 'pending').gt('expires_at', new Date().toISOString());
    } else if (q.status) {
      query = query.eq('status', q.status);
    }
    const { from, to } = rangeFor(q);
    return expectPage<InviteRow, Invite>(
      asRows(await query.order('created_at', { ascending: false }).order('id').range(from, to)),
      toInvite(new Date()),
      q,
    );
  },

  async listRoles(ctx) {
    return expectList<RoleRow, Role>(await ctx.db.from('roles').select(ROLE_SELECT).order('name').limit(50), toRole);
  },

  async createInvite(ctx, input) {
    // p_company_id is deliberately null: the RPC derives the company from the caller's membership.
    const { data, error } = await ctx.db.rpc('create_invite', { p_email: input.email, p_role_key: input.roleKey, p_company_id: null });
    if (error) throw mapDbError(error);
    const parsed = createInviteResultSchema.safeParse(data);
    if (!parsed.success) throw new AppError('internal', { cause: parsed.error });
    const row = parsed.data[0]!;
    return { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at };
  },

  async revokeInvite(ctx, inviteId) {
    const { error } = await ctx.db.rpc('revoke_invite', { p_invite_id: inviteId });
    if (error) throw mapDbError(error);
  },
};
