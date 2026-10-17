import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { pageQuerySchema, type Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { userRepository, type UserRepository } from './repository';
import { inviteCreateSchema, inviteListSchema } from './schema';
import type { CreatedInvite, Invite, Member, Role } from './types';

/**
 * Company users = members + invitations. Not yet possible (needs new RPCs, Phase 5/9): change a member's role,
 * suspend or remove a member, link a login to a driver record. The database has no client path for them today.
 */
export function makeUserService(repo: UserRepository) {
  return {
    async listMembers(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Member>> {
      requirePermission(ctx, PERMISSIONS.usersRead);
      return repo.listMembers(ctx, parseInput(pageQuerySchema, rawQuery ?? {}));
    },
    async listInvites(ctx: TenantServiceContext, rawQuery: unknown): Promise<Page<Invite>> {
      requirePermission(ctx, PERMISSIONS.usersRead);
      return repo.listInvites(ctx, parseInput(inviteListSchema, rawQuery ?? {}));
    },
    async listRoles(ctx: TenantServiceContext): Promise<Role[]> {
      requirePermission(ctx, PERMISSIONS.usersRead);
      return repo.listRoles(ctx);
    },
    /** Returns the raw invite token once. The caller builds the link (see invite-link.ts) and must not persist it. */
    async createInvite(ctx: TenantServiceContext, input: unknown): Promise<CreatedInvite> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      return repo.createInvite(ctx, parseInput(inviteCreateSchema, input));
    },
    async revokeInvite(ctx: TenantServiceContext, rawInviteId: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      await repo.revokeInvite(ctx, parseInput(idSchema, rawInviteId));
    },
  };
}
export type UserService = ReturnType<typeof makeUserService>;
export const userService = makeUserService(userRepository);
