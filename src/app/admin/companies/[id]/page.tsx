import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddNoteForm, InviteOwnerForm } from '@/components/admin/CompanyForms';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { AdminErrorState } from '@/components/admin/StateViews';
import { StatCard } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDateTime } from '@/components/admin/format';
import {
  assignSubscriptionAction,
  revokeInviteAction,
  setCompanyStatusAction,
  setSubscriptionPeriodAction,
  setSubscriptionStatusAction,
} from '@/features/admin/actions';
import type { AdminCompanyDetail } from '@/features/companies/admin-output';
import { companyService } from '@/features/companies/service';
import { subscriptionService } from '@/features/subscriptions/service';
import { AuditTable } from '@/components/admin/AuditTable';
import { auditHref } from '@/features/audit/links';
import type { AuditItem } from '@/features/audit/schema';
import { auditService } from '@/features/audit/service';
import { adminPageOutcome } from '@/features/admin/page-errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { idSchema } from '@/lib/validation/common';

export const metadata = { title: 'Company · Admin' };
export const dynamic = 'force-dynamic';

function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold text-slate-700">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className="min-w-0 break-words text-right text-slate-900">{value ?? <span className="text-slate-400">—</span>}</dd>
  </div>
);

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformServiceContext();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  let result: { data: AdminCompanyDetail } | { error: string } | { missing: true };
  try {
    result = { data: await companyService.adminDetail(ctx, id) };
  } catch (e) {
    const outcome = adminPageOutcome(e);
    result = outcome.kind === 'missing' ? { missing: true } : { error: outcome.message };
  }
  if ('missing' in result) notFound();
  if ('error' in result) {
    return (
      <div className="space-y-4">
        <Link href="/admin/companies" className="text-xs text-slate-500 underline">Companies</Link>
        <AdminErrorState message={result.error} />
      </div>
    );
  }

  const { company: c, subscription: s, counts, owners, pendingInvites, notes, settings, resumeStatus } = result.data;
  // UI visibility only. The services and Postgres authorise every one of these actions again.
  const isSuper = ctx.auth.platformRole === 'super_admin';
  const canSub = isSuper || ctx.auth.platformRole === 'billing';
  let planOptions: { value: string; label: string }[] = [];
  if (canSub && c.status !== 'cancelled') {
    try {
      planOptions = (await subscriptionService.listPlans(ctx)).filter((p) => p.isActive).map((p) => ({ value: p.code, label: p.name }));
    } catch {
      planOptions = []; // the assign button is hidden when the plan list cannot load; the rest of the page still renders
    }
  }
  const canNote = isSuper || ctx.auth.platformRole === 'support';
  let activity: AuditItem[] | null = null;
  try {
    activity = (await auditService.list(ctx, { company: c.id, limit: 10 })).items;
  } catch {
    activity = null; // the activity card is secondary: the page still renders without it
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/admin/companies" className="text-xs text-slate-500 underline">Companies</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <StatusBadge status={c.status} />
        </div>
        <p className="text-xs text-slate-500"><span className="font-mono">{c.slug}</span> · created {fmtDateTime(c.createdAt)}</p>
        {c.status === 'suspended' ? (
          <div role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Suspended {c.suspendedAt ? fmtDateTime(c.suspendedAt) : ''}. Staff, drivers and customers cannot use this company.
            {c.suspensionReason ? <span className="block text-xs text-red-700">Reason: {c.suspensionReason}</span> : null}
          </div>
        ) : null}
        {c.status === 'cancelled' ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
            Cancelled. This company cannot be changed back from the admin panel.
          </div>
        ) : null}
      </div>

      {isSuper && c.status !== 'cancelled' ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Company actions">
          <Link href={`/admin/companies/${c.id}/edit`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100">Edit details</Link>
          {c.status === 'trial' ? (
            <ConfirmDialog
              triggerLabel="Mark active"
              title="Mark this company as active?"
              description="This records that the trial is over and the company is a paying customer. It does not change the subscription."
              confirmLabel="Mark active"
              action={setCompanyStatusAction}
              hidden={{ companyId: c.id, status: 'active' }}
            />
          ) : null}
          {c.status === 'suspended' ? (
            <ConfirmDialog
              triggerLabel="Reactivate"
              title={`Reactivate as ${resumeStatus}?`}
              description="Staff, drivers and customers can use the company again immediately."
              confirmLabel="Reactivate"
              action={setCompanyStatusAction}
              hidden={{ companyId: c.id, status: resumeStatus }}
            />
          ) : (
            <ConfirmDialog
              triggerLabel="Suspend"
              tone="danger"
              title="Suspend this company?"
              description="Staff, drivers and customers lose access immediately. Subscription, trips and bookings are not changed. You can reactivate at any time."
              confirmLabel="Suspend company"
              action={setCompanyStatusAction}
              hidden={{ companyId: c.id, status: 'suspended' }}
              reason={{ label: 'Reason (kept in the audit log)', hint: 'At least 3 characters.' }}
            />
          )}
          <ConfirmDialog
            triggerLabel="Cancel company"
            tone="danger"
            title="Cancel this company permanently?"
            description="Cancellation is final: the company is locked out like a suspension, and it cannot be reactivated from the admin panel. Data is kept."
            confirmLabel="Cancel company"
            action={setCompanyStatusAction}
            hidden={{ companyId: c.id, status: 'cancelled' }}
            reason={{ label: 'Reason (kept in the audit log)', hint: 'At least 3 characters.' }}
          />
        </div>
      ) : null}

      <Section id="h-profile" title="Profile">
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
          <Row label="Legal name" value={c.legalName} />
          <Row label="Tax number" value={c.taxNumber} />
          <Row label="Country" value={c.country} />
          <Row label="Contact name" value={c.contactName} />
          <Row label="Contact email" value={c.contactEmail} />
          <Row label="Contact phone" value={c.contactPhone} />
          <Row label="Timezone / currency" value={settings ? `${settings.timezone} · ${settings.currency}` : null} />
          <Row label="Online booking" value={settings ? (settings.bookingEnabled ? 'Enabled' : 'Disabled by the company') : null} />
        </dl>
      </Section>

      <Section id="h-sub" title="Subscription" aside={canSub && c.status !== 'cancelled' && planOptions.length > 0 ? (
        <ConfirmDialog
          triggerLabel={s ? 'Assign new plan' : 'Assign plan'}
          title="Assign a plan"
          description={s?.isLive ? 'The current subscription is marked expired (kept as history) and replaced by this one. Existing data is not removed if the new plan has lower limits; only new items are blocked.' : 'Starts a new subscription now.'}
          confirmLabel="Assign plan"
          action={assignSubscriptionAction}
          hidden={{ companyId: c.id }}
          fields={[
            { name: 'planCode', label: 'Plan', kind: 'select', options: planOptions, defaultValue: planOptions[0]?.value },
            { name: 'billingInterval', label: 'Billing', kind: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }], defaultValue: 'monthly' },
            { name: 'status', label: 'Start as', kind: 'select', options: [{ value: 'trialing', label: 'Trial' }, { value: 'active', label: 'Active (paid)' }], defaultValue: 'active' },
            { name: 'periodDays', label: 'Period length (days)', kind: 'number', min: 1, max: 1830, defaultValue: '30', hint: 'The period ends this many days from now.' },
          ]}
        />
      ) : null}>
        {s ? (
          <div className="space-y-3">
            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
              <Row label="Plan" value={s.planName} />
              <Row label="Status" value={<StatusBadge status={s.isLive ? s.status : 'expired'} />} />
              <Row label="Billing" value={s.billingInterval} />
              <Row label="Period" value={`${fmtDateTime(s.currentPeriodStart)} → ${fmtDateTime(s.currentPeriodEnd)}`} />
              {s.cancelAtPeriodEnd ? <Row label="Renewal" value="Ends at period end" /> : null}
            </dl>
            {canSub && ['trialing', 'active', 'past_due'].includes(s.status) ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Subscription actions">
                <ConfirmDialog
                  triggerLabel="Change period"
                  title="Change the subscription period"
                  description="Sets a new end date. This also revives a stale subscription whose period has ended."
                  confirmLabel="Save period"
                  action={setSubscriptionPeriodAction}
                  hidden={{ companyId: c.id, subscriptionId: s.id }}
                  fields={[
                    { name: 'days', label: 'Days', kind: 'number', min: 1, max: 1830, defaultValue: '30' },
                    { name: 'from', label: 'Count from', kind: 'select', options: [{ value: 'now', label: 'Today' }, { value: 'current_end', label: 'Current end date' }], defaultValue: 'now' },
                  ]}
                />
                {s.isLive && s.status === 'trialing' ? (
                  <ConfirmDialog triggerLabel="Mark active" title="Mark this subscription active?" description="Records that the trial converted to a paid subscription. The period does not change." confirmLabel="Mark active" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'active' }} />
                ) : null}
                {s.isLive && s.status === 'active' ? (
                  <ConfirmDialog triggerLabel="Mark past due" title="Mark this subscription past due?" description="Use when payment is late. Access is not blocked while the period has not ended." confirmLabel="Mark past due" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'past_due' }} />
                ) : null}
                {s.isLive && s.status === 'past_due' ? (
                  <ConfirmDialog triggerLabel="Mark active" title="Mark this subscription active?" description="Records that payment was received." confirmLabel="Mark active" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'active' }} />
                ) : null}
                <ConfirmDialog
                  triggerLabel="Cancel subscription"
                  tone="danger"
                  title="Cancel this subscription?"
                  description="The company has no live subscription afterwards: new users, buses, drivers, routes, trips and bookings are blocked until you assign a plan. This cannot be undone; assign a new plan to restart."
                  confirmLabel="Cancel subscription"
                  action={setSubscriptionStatusAction}
                  hidden={{ companyId: c.id, subscriptionId: s.id, status: 'cancelled' }}
                  reason={{ label: 'Reason (kept in the audit log)', hint: 'At least 3 characters.' }}
                />
              </div>
            ) : null}
            {!s.isLive ? (
              <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                No live subscription. New trips, buses, drivers, routes, users and bookings are blocked; existing data stays readable.
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            This company has no subscription. New trips, buses, drivers, routes, users and bookings are blocked.
          </p>
        )}
      </Section>

      <Section id="h-usage" title="Usage">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Active users" value={counts.users} />
          <StatCard label="Buses" value={counts.buses} />
          <StatCard label="Drivers" value={counts.drivers} />
          <StatCard label="Routes" value={counts.routes} />
          <StatCard label="Trips" value={counts.trips} />
          <StatCard label="Bookings" value={counts.bookings} />
        </div>
      </Section>

      <Section id="h-owners" title="Owners and invites">
        <div className="space-y-3">
          {owners.length === 0 && pendingInvites.length === 0 ? (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No owner and no pending invite. {isSuper ? 'Create an invite below so someone can sign in.' : 'A super admin must invite an owner.'}
            </p>
          ) : null}
          {owners.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {owners.map((o) => (
                <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0"><span className="font-medium">{o.fullName}</span> <span className="text-xs text-slate-500">{o.email}</span></span>
                  <StatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          ) : null}
          {pendingInvites.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-dashed border-slate-300 bg-white/60">
              {pendingInvites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0"><span className="font-medium">{i.email}</span> <span className="text-xs text-slate-500">invited as {i.roleKey} · expires {fmtDateTime(i.expiresAt)}</span></span>
                  {isSuper ? (
                    <ConfirmDialog
                      triggerLabel="Revoke"
                      tone="danger"
                      title="Revoke this invite?"
                      description="The link stops working immediately. You can create a new invite afterwards."
                      confirmLabel="Revoke invite"
                      action={revokeInviteAction}
                      hidden={{ companyId: c.id, inviteId: i.id }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {isSuper && c.status !== 'cancelled' ? <InviteOwnerForm companyId={c.id} /> : null}
        </div>
      </Section>

      <Section id="h-notes" title="Internal notes" aside={<span className="text-xs text-slate-400">MALAKY staff only</span>}>
        <div className="space-y-4">
          {canNote ? <AddNoteForm companyId={c.id} /> : null}
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {notes.map((n) => (
                <li key={n.id} className="space-y-1 px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{n.body}</p>
                  <p className="text-xs text-slate-500">{n.authorName ?? 'Former staff member'} · {fmtDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section id="h-activity" title="Recent activity" aside={<Link href={auditHref({ company: c.id })} className="text-xs text-slate-600 underline">View all</Link>}>
        {activity === null ? (
          <p className="text-sm text-slate-500">Activity could not be loaded.</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-slate-500">No recorded activity for this company yet.</p>
        ) : (
          <AuditTable items={activity} compact />
        )}
      </Section>
    </div>
  );
}
