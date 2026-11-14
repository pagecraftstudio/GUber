import { T, Dt } from '@/components/dashboard/T';
import { Ltr } from '@/components/dashboard/Ltr';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { userService } from '@/features/users/service';
import { driverService } from '@/features/drivers/service';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';
import { InviteForm, MemberControls, RevokeInvite } from '@/features/dashboard/UsersPanel';

export default async function UsersPage() {
  const auth = await requireTenant('users.read'); // no users.read => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const canWrite = auth.membership.permissions.includes('users.write');
  const canSeeDrivers = auth.membership.permissions.includes('drivers.read');
  const [members, invites, roles, usage, drivers] = await Promise.all([
    userService.listMembers(ctx, { page: 1, pageSize: 100 }),
    userService.listInvites(ctx, { page: 1, pageSize: 100, status: 'pending' }),
    userService.listRoles(ctx),
    canWrite ? planUsageService.getOrNull(ctx) : Promise.resolve(null),
    canSeeDrivers ? driverService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] as Awaited<ReturnType<typeof driverService.list>>['items'] }),
  ]);
  const driverByUser = new Map(drivers.items.filter((d) => d.userId).map((d) => [d.userId!, d.fullName]));
  const pendingDriverIds = new Set(invites.items.filter((i) => i.driverId).map((i) => i.driverId!));
  // driver records that still need a login (active, no login, no invitation in flight): the only ones a driver invite may name
  const openDrivers = drivers.items.filter((d) => d.status === 'active' && !d.userId && !pendingDriverIds.has(d.id)).map((d) => ({ id: d.id, label: d.fullName }));
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Team members" description="People who can sign in to this company, their roles, and pending invitations." />
      {!canWrite && <p role="status" className="mb-5 rounded-xl border border-line-strong bg-status-info-bg px-3.5 py-3 text-sm text-ink-link"><T>You can see the team, but only the company owner can change it.</T></p>}
      <div className={`grid gap-6 ${canWrite ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="members-h">
            <h2 id="members-h" className="mb-3 font-bold"><T>Members</T></h2>
            <DataTable rows={members.items} columns={[
              { key: 'name', label: 'Name', render: (m) => <div><p className="font-bold">{m.fullName ?? m.email}{m.userId === auth.userId && <span className="ms-2 text-xs font-semibold text-ink-secondary"><T>(you)</T></span>}</p><p className="text-xs text-ink-secondary">{m.email && <Ltr>{m.email}</Ltr>}</p></div> },
              { key: 'role', label: 'Role', render: (m) => <div>{m.roleName ?? '—'}{m.roleKey === 'driver' && <p className="text-xs text-ink-secondary">{driverByUser.get(m.userId) ? `Driver record: ${driverByUser.get(m.userId)}` : 'No driver record linked'}</p>}</div> },
              { key: 'status', label: 'Status', render: (m) => <StatusPill value={m.status === 'active' ? 'active' : 'inactive'} /> },
              ...(canWrite ? [{ key: 'manage', label: 'Manage', render: (m: (typeof members.items)[number]) => <MemberControls memberId={m.id} name={m.fullName ?? m.email ?? 'member'} roleKey={m.roleKey} status={m.status} roles={roleOptions} isSelf={m.userId === auth.userId} canWrite /> }] : []),
            ]} />
          </section>
          <section aria-labelledby="invites-h">
            <h2 id="invites-h" className="mb-3 font-bold"><T>Pending invitations</T></h2>
            {invites.items.length === 0 ? <p className="text-sm text-ink-secondary"><T>No pending invitations.</T></p> : (
              <DataTable rows={invites.items} columns={[
                { key: 'email', label: 'Email', render: (i) => <Ltr>{i.email}</Ltr> },
                { key: 'role', label: 'Role', render: (i) => <div>{i.roleName ?? '—'}{i.driverId && <p className="text-xs text-ink-secondary">{`Driver record: ${drivers.items.find((d) => d.id === i.driverId)?.fullName ?? '—'}`}</p>}</div> },
                { key: 'expires', label: 'Expires', render: (i) => <Dt value={i.expiresAt} /> },
                ...(canWrite ? [{ key: 'manage', label: 'Manage', render: (i: (typeof invites.items)[number]) => <RevokeInvite inviteId={i.id} email={i.email} /> }] : []),
              ]} />
            )}
          </section>
        </div>
        {canWrite && <InviteForm roles={roleOptions} usage={usage} drivers={openDrivers} />}
      </div>
    </>
  );
}
