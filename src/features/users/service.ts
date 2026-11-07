import { parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { pageQuerySchema, type Page } from '@/lib/db/pagination';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { idSchema } from '@/lib/validation/common';
import { userRepository, type UserRepository } from './repository';
import { driverInviteSchema, driverLinkSchema, inviteCreateSchema, inviteListSchema, memberRoleSchema, memberStatusSchema } from './schema';
import type { CreatedInvite, Invite, Member, Role } from './types';

/**
 * Company users = members + invitations. Role change and suspend / reactivate go through set_member_role /
 * set_member_status (0025). Still not possible: removing a member, linking a login to a driver record.
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
    /** Invite a login for an existing driver record. users.write (owner) AND drivers.read, like the RPC. */
    async inviteDriver(ctx: TenantServiceContext, input: unknown): Promise<CreatedInvite> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      requirePermission(ctx, PERMISSIONS.driversRead);
      const i = parseInput(driverInviteSchema, input);
      return repo.inviteDriver(ctx, i.driverId, i.email);
    },
    async linkDriverLogin(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      requirePermission(ctx, PERMISSIONS.driversWrite);
      const i = parseInput(driverLinkSchema, input);
      return repo.linkDriverLogin(ctx, i.driverId, i.memberId);
    },
    async setMemberRole(ctx: TenantServiceContext, rawMemberId: unknown, input: unknown): Promise<{ changed: boolean }> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      return repo.setMemberRole(ctx, parseInput(idSchema, rawMemberId), parseInput(memberRoleSchema, input).roleKey);
    },
    async setMemberStatus(ctx: TenantServiceContext, rawMemberId: unknown, rawStatus: unknown): Promise<{ changed: boolean }> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      return repo.setMemberStatus(ctx, parseInput(idSchema, rawMemberId), parseInput(memberStatusSchema, rawStatus));
    },
    async revokeInvite(ctx: TenantServiceContext, rawInviteId: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.usersWrite);
      await repo.revokeInvite(ctx, parseInput(idSchema, rawInviteId));
    },
  };
}
export type UserService = ReturnType<typeof makeUserService>;
export const userService = makeUserService(userRepository);
