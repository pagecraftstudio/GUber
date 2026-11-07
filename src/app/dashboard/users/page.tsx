import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { userService } from '@/features/users/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';
import { InviteForm, MemberControls, RevokeInvite } from '@/features/dashboard/UsersPanel';

export default async function UsersPage() {
  const auth = await requireTenant('users.read'); // no users.read => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('users.write');
  const [members, invites, roles, usage] = await Promise.all([
    userService.listMembers(ctx, { page: 1, pageSize: 100 }),
    userService.listInvites(ctx, { page: 1, pageSize: 100, status: 'pending' }),
    userService.listRoles(ctx),
    canWrite ? planUsageService.getOrNull(ctx) : Promise.resolve(null),
  ]);
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Team members" description="People who can sign in to this company, their roles, and pending invitations." />
      {!canWrite && <p role="status" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">You can see the team, but only the company owner can change it.</p>}
      <div className={`grid gap-6 ${canWrite ? 'xl:grid-cols-[1fr_360px]' : ''}`}>
        <div className="space-y-6">
          <section aria-labelledby="members-h">
            <h2 id="members-h" className="mb-3 font-bold">Members</h2>
            <DataTable rows={members.items} columns={[
              { key: 'name', label: 'Name', render: (m) => <div><p className="font-bold">{m.fullName ?? m.email}{m.userId === auth.userId && <span className="ms-2 text-xs font-semibold text-slate-600 dark:text-slate-400">(you)</span>}</p><p className="text-xs text-slate-600 dark:text-slate-400">{m.email}</p></div> },
              { key: 'role', label: 'Role', render: (m) => m.roleName ?? '—' },
              { key: 'status', label: 'Status', render: (m) => <StatusPill value={m.status === 'active' ? 'active' : 'inactive'} /> },
              ...(canWrite ? [{ key: 'manage', label: 'Manage', render: (m: (typeof members.items)[number]) => <MemberControls memberId={m.id} name={m.fullName ?? m.email ?? 'member'} roleKey={m.roleKey} status={m.status} roles={roleOptions} isSelf={m.userId === auth.userId} canWrite /> }] : []),
            ]} />
          </section>
          <section aria-labelledby="invites-h">
            <h2 id="invites-h" className="mb-3 font-bold">Pending invitations</h2>
            {invites.items.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-400">No pending invitations.</p> : (
              <DataTable rows={invites.items} columns={[
                { key: 'email', label: 'Email', render: (i) => i.email },
                { key: 'role', label: 'Role', render: (i) => i.roleName ?? '—' },
                { key: 'expires', label: 'Expires', render: (i) => new Date(i.expiresAt).toLocaleDateString() },
                ...(canWrite ? [{ key: 'manage', label: 'Manage', render: (i: (typeof invites.items)[number]) => <RevokeInvite inviteId={i.id} email={i.email} /> }] : []),
              ]} />
            )}
          </section>
        </div>
        {canWrite && <InviteForm roles={roleOptions} usage={usage} />}
      </div>
    </>
  );
}
