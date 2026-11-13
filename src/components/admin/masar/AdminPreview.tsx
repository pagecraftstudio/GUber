import { AdminShellMasar } from '@/ds/shell/AdminShellMasar';
import { Breadcrumbs } from '@/ds/data/Layout';
import type { AdminCompanyDetail, AdminCompanyListItem } from '@/features/companies/admin-output';
import { CompaniesMasarView } from './CompaniesMasarView';
import { CompanyDetailMasarView } from './CompanyDetailMasarView';
import { CreateCompanyForm, EditCompanyForm } from './CompanyFormsMasar';
import { AuditEntryMasar, AuditListMasar, PlansMasar, PlatformOverviewMasar, SubscriptionsMasar } from './PlatformMasarViews';
import { buildMetadataView } from '@/features/audit/diff';

const LIST: AdminCompanyListItem[] = [
  { id: 'a', name: 'Delta Express', slug: 'delta-express', status: 'active', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', createdAt: '2026-10-05T09:00:00Z', planCode: 'pro', planName: 'Pro', subscriptionStatus: 'active', periodEnd: null },
  { id: 'b', name: 'Nile Campus Lines', slug: 'nile-campus', status: 'trial', contactName: 'Omar Hassan', contactEmail: 'omar@nile.example', createdAt: '2026-11-02T09:00:00Z', planCode: 'starter', planName: 'Starter', subscriptionStatus: 'trialing', periodEnd: null },
  { id: 'c', name: 'شركة الأمل للنقل', slug: 'al-amal', status: 'suspended', contactName: null, contactEmail: null, createdAt: '2026-08-14T09:00:00Z', planCode: null, planName: null, subscriptionStatus: null, periodEnd: null },
];
const detail = (over: Partial<AdminCompanyDetail['company']> = {}, sub = true, owner = true): AdminCompanyDetail => ({
  company: { id: 'a', name: 'Delta Express', slug: 'delta-express', status: 'active', legalName: 'Delta Express LLC', taxNumber: '123-456-789', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', contactPhone: '+201012345678', country: 'EG', suspendedAt: null, suspensionReason: null, createdAt: '2026-10-05T09:00:00Z', updatedAt: '2026-10-06T09:00:00Z', ...over },
  settings: { timezone: 'Africa/Cairo', currency: 'EGP', defaultLocale: 'ar', bookingEnabled: true },
  subscription: sub ? { id: 's', planCode: 'pro', planName: 'Pro', status: 'active', billingInterval: 'monthly', currentPeriodStart: '2026-10-05T09:00:00Z', currentPeriodEnd: '2026-11-05T09:00:00Z', cancelAtPeriodEnd: false, isLive: true } : null,
  counts: { users: 4, buses: 6, drivers: 5, routes: 3, trips: 120, bookings: 3400 } as never,
  owners: owner ? [{ userId: 'u', fullName: 'Mona Ali', email: 'mona@delta.example', status: 'active' }] : [],
  pendingInvites: owner ? [{ id: 'i', email: 'new@delta.example', roleKey: 'company_owner', expiresAt: '2026-11-20T09:00:00Z', createdAt: '2026-11-10T09:00:00Z' }] : [],
  notes: [{ id: 'n', body: 'Called on Sunday. They want a second bus added before exams.', createdAt: '2026-11-01T10:00:00Z', authorName: 'Sara' }],
  resumeStatus: 'active',
});

const OVERVIEW = { generatedAt: '2026-11-13T10:30:00Z', companies: { total: 12, trial: 3, active: 7, suspended: 1, cancelled: 1 }, subscriptions: { trialing: 3, active: 7, pastDue: 2, expiring14d: 1, staleLive: 1, companiesWithoutLive: 1 }, usage: { tripsTotal: 1234, trips30d: 210, bookingsTotal: 9876, bookings30d: 1500, customersTotal: 4321 }, recentActivity: [{ id: 'e1', createdAt: '2026-11-13T09:00:00Z', action: 'company.suspended', entityType: 'company', actorType: 'platform_user', companyId: 'a', companyName: 'Delta Express' }, { id: 'e2', createdAt: '2026-11-12T15:20:00Z', action: 'subscription.assigned', entityType: 'subscription', actorType: 'platform_user', companyId: 'b', companyName: 'Nile Campus Lines' }] };
const PLAN_LIST = [{ id: 'p1', code: 'starter', name: 'Starter', priceMonthly: 1500, priceYearly: 15000, currency: 'EGP', trialDays: 14, isActive: true, isPublic: true, entitlements: { max_buses: { kind: 'limit', limit: 5 }, max_users: { kind: 'limit', limit: 3 }, feature_analytics: { kind: 'flag', enabled: false } } }, { id: 'p2', code: 'pro', name: 'Pro', priceMonthly: 4500, priceYearly: null, currency: 'EGP', trialDays: 14, isActive: true, isPublic: false, entitlements: { max_buses: { kind: 'limit', limit: null }, max_users: { kind: 'limit', limit: null }, feature_analytics: { kind: 'flag', enabled: true } } }];
const SUBS = [{ id: 's1', companyId: 'a', companyName: 'Delta Express', companySlug: 'delta-express', companyStatus: 'active', planCode: 'pro', planName: 'Pro', status: 'active', state: 'live', billingInterval: 'monthly', currentPeriodStart: '2026-10-05T09:00:00Z', currentPeriodEnd: '2026-11-05T09:00:00Z', cancelAtPeriodEnd: false, createdAt: '2026-09-01T09:00:00Z' }, { id: 's2', companyId: 'b', companyName: 'Nile Campus Lines', companySlug: 'nile-campus', companyStatus: 'trial', planCode: 'starter', planName: 'Starter', status: 'trialing', state: 'stale', billingInterval: 'yearly', currentPeriodStart: '2026-10-01T09:00:00Z', currentPeriodEnd: '2026-11-01T09:00:00Z', cancelAtPeriodEnd: false, createdAt: '2026-10-01T09:00:00Z' }] as never[];
const AUDIT = [{ id: 'e1', createdAt: '2026-11-13T09:00:00Z', action: 'company.suspended', entityType: 'company', entityId: 'a', actorType: 'platform_user', actorId: 'u1', actorName: 'Mona Ali', companyId: 'a', companyName: 'Delta Express', changedKeys: ['status', 'suspension_reason'] }, { id: 'e2', createdAt: '2026-11-12T15:20:00Z', action: 'subscription.assigned', entityType: 'subscription', entityId: 's2', actorType: 'platform_user', actorId: 'u2', actorName: 'Sara Nabil', companyId: 'b', companyName: 'Nile Campus Lines', changedKeys: [] }];
const noopAction = async () => ({ status: 'ok' }) as never;
const NAV = [{ href: '/admin', label: 'Overview', available: true }, { href: '/admin/companies', label: 'Companies', available: true }, { href: '/admin/subscriptions', label: 'Subscriptions', available: true }, { href: '/admin/plans', label: 'Plans', available: true }, { href: '/admin/audit-logs', label: 'Audit logs', available: true }];
const PLANS = [{ value: 'pro', label: 'Pro' }, { value: 'starter', label: 'Starter' }];

export function AdminPreview({ view, logoutAction }: { view: string; logoutAction: () => void }) {
  let body: React.ReactNode;
  if (view === 'detail') body = <CompanyDetailMasarView data={detail()} isSuper canSub canNote planOptions={PLANS} activity={[]} />;
  else if (view === 'suspended') body = <CompanyDetailMasarView data={detail({ status: 'suspended', suspendedAt: '2026-11-01T08:00:00Z', suspensionReason: 'Unpaid for 60 days' })} isSuper canSub canNote planOptions={PLANS} activity={[]} />;
  else if (view === 'none') body = <CompanyDetailMasarView data={detail({}, false, false)} isSuper canSub canNote planOptions={PLANS} activity={null} />;
  else if (view === 'overview') body = <PlatformOverviewMasar res={{ data: OVERVIEW as never }} />;
  else if (view === 'plans') body = <PlansMasar result={{ data: PLAN_LIST as never }} />;
  else if (view === 'subs') body = <SubscriptionsMasar query={{ sort: 'period_end', dir: 'asc' }} canWrite result={{ data: { items: SUBS, total: 2, page: 1, pageSize: 20, hasMore: false } as never }} expireAction={noopAction} />;
  else if (view === 'audit') body = <AuditListMasar query={{}} page={{ data: { items: AUDIT, hasMore: true, next: { bat: '2026-11-12T15:20:00Z', bid: 'e2' } } }} summary={{ days: 7, since: '2026-11-06T00:00:00Z', total: 1500, byNamespace: [{ namespace: 'company', count: 20 }, { namespace: 'subscription', count: 11 }], platformActors: [{ actorId: 'u1', actorName: 'Mona Ali', count: 9 }] }} days={7} ignored={false} />;
  else if (view === 'entry') body = <AuditEntryMasar e={{ ...AUDIT[0]!, actorEmail: 'mona@masar.example', metadata: { before: { status: 'active' }, after: { status: 'suspended', suspension_reason: 'Unpaid for 60 days' } }, metadataRedacted: false } as never} view={buildMetadataView({ before: { status: 'active' }, after: { status: 'suspended', suspension_reason: 'Unpaid for 60 days' } })} subject="/admin/companies/a" />;
  else if (view === 'new') body = <div className="max-w-xl space-y-6"><Breadcrumbs items={[{ label: 'Companies', href: '/admin/companies' }, { label: 'New company' }]} /><h1 className="text-2xl font-medium text-ink-primary">New company</h1><CreateCompanyForm plans={[{ code: 'pro', name: 'Pro', trialDays: 14 }, { code: 'starter', name: 'Starter', trialDays: 7 }]} /></div>;
  else if (view === 'edit') body = <div className="max-w-xl space-y-6"><h1 className="text-2xl font-medium text-ink-primary">Edit company</h1><EditCompanyForm company={{ id: 'a', name: 'Delta Express', legalName: 'Delta Express LLC', taxNumber: '123-456-789', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', contactPhone: '+201012345678', country: 'EG' }} /></div>;
  else body = <CompaniesMasarView query={{}} canCreate result={{ data: { items: LIST, total: 3, page: 1, pageSize: 20, hasMore: false } as never }} />;
  return (
    <div data-ds="masar" style={{ display: 'contents' }}><div data-preview="MASAR-ADMIN-PREVIEW"><AdminShellMasar fullName="Mona Ali" roleLabel="super admin" items={NAV} logoutAction={logoutAction}>{body}</AdminShellMasar></div></div>
  );
}
