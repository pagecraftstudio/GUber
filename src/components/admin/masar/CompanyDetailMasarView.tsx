import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Breadcrumbs, KeyValue, MetricCard } from '@/ds/data/Layout';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, formatNumber, formatTime } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { buttonClass } from '@/ds/primitives/button-class';
import { assignSubscriptionAction, revokeInviteAction, setCompanyStatusAction, setSubscriptionPeriodAction, setSubscriptionStatusAction } from '@/features/admin/actions';
import type { AdminCompanyDetail } from '@/features/companies/admin-output';
import { auditHref } from '@/features/audit/links';
import type { AuditItem } from '@/features/audit/schema';
import { AuditTable } from '../AuditTable';
import { AdminActionDialog } from './AdminActionDialog';
import { AddNoteForm, InviteOwnerForm } from './CompanyFormsMasar';

const utc = (iso: string) => `${formatDate(iso, 'en', { timeZone: 'UTC', style: 'long' })}, ${formatTime(iso, 'en', { timeZone: 'UTC' })} UTC`;
const REASON = { label: 'Reason (kept in the audit log)', hint: 'At least 3 characters.' };

function Section({ id, title, children, aside }: { id: string; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={id} className="text-lg font-medium text-ink-primary">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}
const Card = ({ children, dashed }: { children: ReactNode; dashed?: boolean }) => <div className={`rounded-ds-md border bg-surface-card p-4 ${dashed ? 'border-dashed border-line-strong' : 'border-line-default'}`}>{children}</div>;
const Rows = ({ children }: { children: ReactNode }) => <ul className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card">{children}</ul>;

export interface CompanyDetailMasarViewProps {
  data: AdminCompanyDetail;
  /** UI visibility only. The services and Postgres authorise every action again. */
  isSuper: boolean; canSub: boolean; canNote: boolean;
  planOptions: { value: string; label: string }[];
  activity: AuditItem[] | null;
}

/** Company detail: facts first, then the things a platform admin can do, each with its consequence spelled out in a dialog. Data, permissions and server actions are the old page's. */
export function CompanyDetailMasarView({ data, isSuper, canSub, canNote, planOptions, activity }: CompanyDetailMasarViewProps) {
  const { company: c, subscription: s, counts, owners, pendingInvites, notes, settings, resumeStatus } = data;
  const editable = c.status !== 'cancelled';
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Breadcrumbs items={[{ label: 'Companies', href: '/admin/companies' }, { label: c.name }]} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-medium text-ink-primary">{c.name}</h1><StatusBadge domain="company" value={c.status} lang="en" /></div>
            <p className="text-[13px] text-ink-muted"><Identifier value={c.slug} /> · created {utc(c.createdAt)}</p>
          </div>
          {isSuper && editable ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Company actions">
              <Link href={`/admin/companies/${c.id}/edit`} className={buttonClass('secondary', 'md')}>Edit details</Link>
              {c.status === 'trial' ? (
                <AdminActionDialog triggerLabel="Mark active" title="Mark this company as active?" description="This records that the trial is over and the company is a paying customer. It does not change the subscription." confirmLabel="Mark active" action={setCompanyStatusAction} hidden={{ companyId: c.id, status: 'active' }} />
              ) : null}
              {c.status === 'suspended' ? (
                <AdminActionDialog triggerLabel="Reactivate" title={`Reactivate as ${resumeStatus}?`} description="Staff, drivers and customers can use the company again immediately." confirmLabel="Reactivate" action={setCompanyStatusAction} hidden={{ companyId: c.id, status: resumeStatus }} />
              ) : (
                <AdminActionDialog triggerLabel="Suspend" tone="danger" title="Suspend this company?" description="Staff, drivers and customers lose access immediately. Subscription, trips and bookings are not changed. You can reactivate at any time." confirmLabel="Suspend company" action={setCompanyStatusAction} hidden={{ companyId: c.id, status: 'suspended' }} reason={REASON} />
              )}
              <AdminActionDialog triggerLabel="Cancel company" tone="danger" title="Cancel this company permanently?" description="Cancellation is final: the company is locked out like a suspension, and it cannot be reactivated from the admin panel. Data is kept." confirmLabel="Cancel company" action={setCompanyStatusAction} hidden={{ companyId: c.id, status: 'cancelled' }} reason={REASON} />
            </div>
          ) : null}
        </div>
        {c.status === 'suspended' ? (
          <InlineAlert tone="error" title={`Suspended${c.suspendedAt ? ` ${utc(c.suspendedAt)}` : ''}`}>
            Staff, drivers and customers cannot use this company.{c.suspensionReason ? <span className="mt-0.5 block text-[13px]">Reason: {c.suspensionReason}</span> : null}
          </InlineAlert>
        ) : null}
        {c.status === 'cancelled' ? <InlineAlert tone="info" title="Cancelled">This company cannot be changed back from the admin panel.</InlineAlert> : null}
      </header>

      <Section id="h-profile" title="Profile">
        <Card>
          <KeyValue items={[
            { label: 'Legal name', value: c.legalName ?? '—' }, { label: 'Tax number', value: c.taxNumber ?? '—' }, { label: 'Country', value: c.country ?? '—' },
            { label: 'Contact name', value: c.contactName ?? '—' }, { label: 'Contact email', value: c.contactEmail ? <Identifier value={c.contactEmail} /> : '—' }, { label: 'Contact phone', value: c.contactPhone ? <Identifier value={c.contactPhone} /> : '—' },
            { label: 'Time zone and currency', value: settings ? `${settings.timezone} · ${settings.currency}` : '—' },
            { label: 'Online booking', value: settings ? (settings.bookingEnabled ? 'Enabled' : 'Disabled by the company') : '—' },
          ]} />
        </Card>
      </Section>

      <Section id="h-sub" title="Subscription" aside={canSub && editable && planOptions.length > 0 ? (
        <AdminActionDialog
          triggerLabel={s ? 'Assign new plan' : 'Assign plan'} title="Assign a plan"
          description={s?.isLive ? 'The current subscription is marked expired (kept as history) and replaced by this one. Existing data is not removed if the new plan has lower limits; only new items are blocked.' : 'Starts a new subscription now.'}
          confirmLabel="Assign plan" action={assignSubscriptionAction} hidden={{ companyId: c.id }}
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
            <Card>
              <KeyValue items={[
                { label: 'Plan', value: s.planName }, { label: 'Status', value: <StatusBadge domain="subscription" value={s.isLive ? s.status : 'expired'} lang="en" /> },
                { label: 'Billing', value: s.billingInterval }, { label: 'Period', value: `${utc(s.currentPeriodStart)} → ${utc(s.currentPeriodEnd)}` },
                ...(s.cancelAtPeriodEnd ? [{ label: 'Renewal', value: 'Ends at period end' }] : []),
              ]} />
            </Card>
            {canSub && ['trialing', 'active', 'past_due'].includes(s.status) ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Subscription actions">
                <AdminActionDialog triggerLabel="Change period" title="Change the subscription period" description="Sets a new end date. This also revives a stale subscription whose period has ended." confirmLabel="Save period" action={setSubscriptionPeriodAction} hidden={{ companyId: c.id, subscriptionId: s.id }}
                  fields={[{ name: 'days', label: 'Days', kind: 'number', min: 1, max: 1830, defaultValue: '30' }, { name: 'from', label: 'Count from', kind: 'select', options: [{ value: 'now', label: 'Today' }, { value: 'current_end', label: 'Current end date' }], defaultValue: 'now' }]} />
                {s.isLive && s.status === 'trialing' ? <AdminActionDialog triggerLabel="Mark active" title="Mark this subscription active?" description="Records that the trial converted to a paid subscription. The period does not change." confirmLabel="Mark active" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'active' }} /> : null}
                {s.isLive && s.status === 'active' ? <AdminActionDialog triggerLabel="Mark past due" title="Mark this subscription past due?" description="Use when payment is late. Access is not blocked while the period has not ended." confirmLabel="Mark past due" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'past_due' }} /> : null}
                {s.isLive && s.status === 'past_due' ? <AdminActionDialog triggerLabel="Mark active" title="Mark this subscription active?" description="Records that payment was received." confirmLabel="Mark active" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'active' }} /> : null}
                <AdminActionDialog triggerLabel="Cancel subscription" tone="danger" title="Cancel this subscription?" description="The company has no live subscription afterwards: new users, buses, drivers, routes, trips and bookings are blocked until you assign a plan. This cannot be undone; assign a new plan to restart." confirmLabel="Cancel subscription" action={setSubscriptionStatusAction} hidden={{ companyId: c.id, subscriptionId: s.id, status: 'cancelled' }} reason={REASON} />
              </div>
            ) : null}
            {!s.isLive ? <InlineAlert tone="error" title="No live subscription">New trips, buses, drivers, routes, users and bookings are blocked; existing data stays readable.</InlineAlert> : null}
          </div>
        ) : (
          <InlineAlert tone="error" title="No subscription">This company has no subscription. New trips, buses, drivers, routes, users and bookings are blocked.</InlineAlert>
        )}
      </Section>

      <Section id="h-usage" title="Usage">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {([['Active users', counts.users], ['Buses', counts.buses], ['Drivers', counts.drivers], ['Routes', counts.routes], ['Trips', counts.trips], ['Bookings', counts.bookings]] as const).map(([l, n]) => <MetricCard key={l} label={l} value={formatNumber(n, 'en')} />)}
        </div>
      </Section>

      <Section id="h-owners" title="Owners and invites">
        <div className="space-y-3">
          {owners.length === 0 && pendingInvites.length === 0 ? <InlineAlert tone="warning" title="No owner and no pending invite">{isSuper ? 'Create an invite below so someone can sign in.' : 'A super admin must invite an owner.'}</InlineAlert> : null}
          {owners.length > 0 ? (
            <Rows>{owners.map((o) => (
              <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="font-medium text-ink-primary">{o.fullName}</span> <span className="text-[13px] text-ink-muted"><Identifier value={o.email} /></span></span>
                <StatusBadge domain="member" value={o.status} lang="en" />
              </li>))}
            </Rows>
          ) : null}
          {pendingInvites.length > 0 ? (
            <Rows>{pendingInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="font-medium text-ink-primary"><Identifier value={i.email} /></span> <span className="text-[13px] text-ink-muted">invited as {i.roleKey} · expires {utc(i.expiresAt)}</span></span>
                {isSuper ? <AdminActionDialog triggerLabel="Revoke" tone="danger" title="Revoke this invite?" description="The link stops working immediately. You can create a new invite afterwards." confirmLabel="Revoke invite" action={revokeInviteAction} hidden={{ companyId: c.id, inviteId: i.id }} /> : null}
              </li>))}
            </Rows>
          ) : null}
          {isSuper && editable ? <Card><InviteOwnerForm companyId={c.id} /></Card> : null}
        </div>
      </Section>

      <Section id="h-notes" title="Internal notes" aside={<span className="text-[13px] text-ink-muted">MASAR platform team only</span>}>
        <div className="space-y-4">
          {canNote ? <Card><AddNoteForm companyId={c.id} /></Card> : null}
          {notes.length === 0 ? <p className="text-sm text-ink-secondary">No notes yet.</p> : (
            <Rows>{notes.map((n) => (
              <li key={n.id} className="space-y-1 px-4 py-3"><p className="text-sm break-words whitespace-pre-wrap text-ink-primary">{n.body}</p><p className="text-[13px] text-ink-muted">{n.authorName ?? 'Former staff member'} · {utc(n.createdAt)}</p></li>))}
            </Rows>
          )}
        </div>
      </Section>

      <Section id="h-activity" title="Recent activity" aside={<Link href={auditHref({ company: c.id })} className="text-sm text-ink-link underline-offset-2 hover:underline">View all</Link>}>
        {activity === null ? <p className="text-sm text-ink-secondary">Activity could not be loaded.</p> : activity.length === 0 ? <p className="text-sm text-ink-secondary">No recorded activity for this company yet.</p> : <AuditTable items={activity} compact />}
      </Section>
    </div>
  );
}
