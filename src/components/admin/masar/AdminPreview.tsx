import { AdminShellMasar } from '@/ds/shell/AdminShellMasar';
import { Breadcrumbs } from '@/ds/data/Layout';
import type { AdminCompanyDetail, AdminCompanyListItem } from '@/features/companies/admin-output';
import { CompaniesMasarView } from './CompaniesMasarView';
import { CompanyDetailMasarView } from './CompanyDetailMasarView';
import { CreateCompanyForm, EditCompanyForm } from './CompanyFormsMasar';

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
const NAV = [{ href: '/admin', label: 'Overview', available: true }, { href: '/admin/companies', label: 'Companies', available: true }, { href: '/admin/subscriptions', label: 'Subscriptions', available: true }, { href: '/admin/plans', label: 'Plans', available: true }, { href: '/admin/audit-logs', label: 'Audit logs', available: true }];
const PLANS = [{ value: 'pro', label: 'Pro' }, { value: 'starter', label: 'Starter' }];

export function AdminPreview({ view, logoutAction }: { view: string; logoutAction: () => void }) {
  let body: React.ReactNode;
  if (view === 'detail') body = <CompanyDetailMasarView data={detail()} isSuper canSub canNote planOptions={PLANS} activity={[]} />;
  else if (view === 'suspended') body = <CompanyDetailMasarView data={detail({ status: 'suspended', suspendedAt: '2026-11-01T08:00:00Z', suspensionReason: 'Unpaid for 60 days' })} isSuper canSub canNote planOptions={PLANS} activity={[]} />;
  else if (view === 'none') body = <CompanyDetailMasarView data={detail({}, false, false)} isSuper canSub canNote planOptions={PLANS} activity={null} />;
  else if (view === 'new') body = <div className="max-w-xl space-y-6"><Breadcrumbs items={[{ label: 'Companies', href: '/admin/companies' }, { label: 'New company' }]} /><h1 className="text-2xl font-medium text-ink-primary">New company</h1><CreateCompanyForm plans={[{ code: 'pro', name: 'Pro', trialDays: 14 }, { code: 'starter', name: 'Starter', trialDays: 7 }]} /></div>;
  else if (view === 'edit') body = <div className="max-w-xl space-y-6"><h1 className="text-2xl font-medium text-ink-primary">Edit company</h1><EditCompanyForm company={{ id: 'a', name: 'Delta Express', legalName: 'Delta Express LLC', taxNumber: '123-456-789', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', contactPhone: '+201012345678', country: 'EG' }} /></div>;
  else body = <CompaniesMasarView query={{}} canCreate result={{ data: { items: LIST, total: 3, page: 1, pageSize: 20, hasMore: false } as never }} />;
  return (
    <div data-ds="masar" style={{ display: 'contents' }}><div data-preview="MASAR-ADMIN-PREVIEW"><AdminShellMasar fullName="Mona Ali" roleLabel="super admin" items={NAV} logoutAction={logoutAction}>{body}</AdminShellMasar></div></div>
  );
}
