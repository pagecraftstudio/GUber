'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DataTable, type Column } from '@/ds/data/DataTable';
import { Pagination } from '@/ds/data/Pagination';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Identifier } from '@/ds/format/Identifier';
import { formatDay, formatNumber, localDigits } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { Field } from '@/ds/primitives/Field';
import { Input } from '@/ds/primitives/Input';
import { PlanLimitNotice } from '@/components/dashboard/FormParts';
import { BusCreateForm, DriverCreateForm } from '../CreateForms';
import { DriverLogin, type LinkableMember } from '../DriverLogin';
import { BusStatusSelect, DriverStatusSelect, RouteActiveSwitch } from '../InlineControls';
import type { PlanUsage } from '@/features/subscriptions/usage';
import type { Route } from '@/features/routes/types';
import type { Bus } from '@/features/buses/types';
import type { Driver } from '@/features/drivers/types';
import type { Customer } from '@/features/customers/types';
import { PageHeaderMasar } from './PageHeaderMasar';
import { J6 } from './text6';

const linkCls = 'font-medium text-action underline-offset-2 hover:underline';

export function RoutesMasarView(p: { rows: Route[]; canWrite: boolean; usage: PlanUsage | null }) {
  const t = J6[useDsLang()];
  const cols: Column<Route>[] = [
    { key: 'name', primary: true, header: t.route, cell: (r) => <Link href={`/dashboard/routes/${r.id}`} className={linkCls}>{r.name}</Link> },
    { key: 'origin', header: t.origin, cell: (r) => r.originName },
    { key: 'destination', header: t.destination, cell: (r) => r.destinationName },
    { key: 'status', header: t.status, cell: (r) => <StatusBadge domain="route" value={r.isActive ? 'active' : 'inactive'} /> },
    { key: 'manage', header: t.manage, cell: (r) => (
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/routes/${r.id}`} className={linkCls} aria-label={`${p.canWrite ? t.edit : t.view} ${r.name}`}>{p.canWrite ? t.edit : t.view}</Link>
        {p.canWrite ? <RouteActiveSwitch id={r.id} isActive={r.isActive} name={r.name} /> : null}
      </div>) },
  ];
  return (
    <>
      <PageHeaderMasar title={t.routes} description={t.routesText}
        actions={p.canWrite ? <Link href="/dashboard/routes/new" className={buttonClass('primary', 'md')}>{t.addRoute}</Link> : undefined} />
      {p.canWrite ? <div className="mb-5"><PlanLimitNotice usage={p.usage} resource="max_routes" /></div> : null}
      <DataTable caption={t.routes} columns={cols} rows={p.rows} rowId={(r) => r.id} empty={{ title: t.noRoutes, description: t.noRoutesText }} />
    </>
  );
}

export function BusesMasarView(p: { rows: Bus[]; canWrite: boolean; usage: PlanUsage | null }) {
  const lang = useDsLang();
  const t = J6[lang];
  const cols: Column<Bus>[] = [
    { key: 'plate', primary: true, header: t.vehicle, cell: (r) => (
      <div><Identifier value={r.plateNumber} /><p className="text-[13px] font-normal text-ink-secondary">{[r.make, r.model, r.year ? localDigits(String(r.year), lang) : null].filter(Boolean).join(' ') || r.name || t.busFallback}</p></div>) },
    { key: 'capacity', numeric: true, header: t.seats, cell: (r) => formatNumber(r.capacity, lang) },
    { key: 'status', header: t.status, cell: (r) => <StatusBadge domain="bus" value={r.status} /> },
    { key: 'action', header: t.update, cell: (r) => (p.canWrite ? <BusStatusSelect id={r.id} value={r.status} plate={r.plateNumber} /> : '—') },
  ];
  return (
    <>
      <PageHeaderMasar title={t.fleet} description={t.fleetText} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0"><DataTable caption={t.fleet} columns={cols} rows={p.rows} rowId={(r) => r.id} empty={{ title: t.noBuses, description: t.noBusesText }} /></div>
        {p.canWrite ? <BusCreateForm usage={p.usage} /> : null}
      </div>
    </>
  );
}

export type DriverLoginProps = { linked: { name: string; email: string | null; suspended: boolean } | null; pendingExpires: string | null };
export function DriversMasarView(p: { rows: Driver[]; logins: Record<string, DriverLoginProps>; members: LinkableMember[]; canWrite: boolean; canLogin: boolean; usage: PlanUsage | null }) {
  const t = J6[useDsLang()];
  const dash = (v: string | null) => (v ? <Identifier value={v} /> : '—');
  const cols: Column<Driver>[] = [
    { key: 'name', primary: true, header: t.driver, cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: 'phone', header: t.phone, cell: (r) => dash(r.phone) },
    { key: 'licence', header: t.licence, cell: (r) => dash(r.licenseNumber) },
    { key: 'expiry', header: t.licenceExpiry, cell: (r) => dash(r.licenseExpiry) },
    { key: 'login', header: t.login, cell: (r) => (
      <DriverLogin driverId={r.id} driverName={r.fullName} driverActive={r.status === 'active'} linked={p.logins[r.id]?.linked ?? null} pendingExpires={p.logins[r.id]?.pendingExpires ?? null} members={p.members} canManage={p.canLogin} />) },
    { key: 'status', header: t.status, cell: (r) => <StatusBadge domain="driver" value={r.status} /> },
    { key: 'action', header: t.update, cell: (r) => (p.canWrite ? <DriverStatusSelect id={r.id} value={r.status} name={r.fullName} /> : '—') },
  ];
  return (
    <>
      <PageHeaderMasar title={t.drivers} description={t.driversText} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0"><DataTable caption={t.drivers} columns={cols} rows={p.rows} rowId={(r) => r.id} empty={{ title: t.noDrivers, description: t.noDriversText }} /></div>
        {p.canWrite ? <DriverCreateForm usage={p.usage} /> : null}
      </div>
    </>
  );
}

export function CustomersMasarView(p: { rows: Customer[]; q: string; page: number; pageSize: number; total: number }) {
  const lang = useDsLang();
  const t = J6[lang];
  const cols: Column<Customer>[] = [
    { key: 'name', primary: true, header: t.name, cell: (c) => <Link href={`/dashboard/customers/${c.id}`} className={linkCls}>{c.fullName}</Link> },
    { key: 'phone', header: t.phone, cell: (c) => <Identifier value={c.phone} /> },
    { key: 'email', header: t.email, cell: (c) => (c.email ? <Identifier value={c.email} /> : '—') },
    { key: 'university', header: t.university, cell: (c) => c.university ?? '—' },
    { key: 'created', header: t.since, cell: (c) => formatDay(c.createdAt, lang, 'numeric') },
  ];
  const pageCount = Math.max(1, Math.ceil(p.total / p.pageSize));
  const search: ReactNode = (
    <form method="get" role="search" className="mb-4 flex max-w-xl flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1"><Field label={t.searchCustomers}><Input name="q" type="search" defaultValue={p.q} maxLength={200} autoComplete="off" /></Field></div>
      <Button type="submit">{t.search}</Button>
      {p.q ? <Link href="/dashboard/customers" className={buttonClass('secondary', 'md')}>{t.clearSearch}</Link> : null}
    </form>
  );
  return (
    <>
      <PageHeaderMasar title={t.customers} description={t.customersText} />
      {search}
      <p role="status" className="mb-3 text-sm text-ink-secondary">{t.count(formatNumber(p.total, lang))}</p>
      <DataTable caption={t.customers} columns={cols} rows={p.rows} rowId={(c) => c.id}
        empty={{ title: p.q ? t.noMatch : t.noCustomers, description: p.q ? t.noMatchText : t.noCustomersText }} />
      <div className="mt-4"><Pagination page={p.page} pageCount={pageCount} hrefBase="/dashboard/customers" hrefParams={{ q: p.q }} /></div>
    </>
  );
}
