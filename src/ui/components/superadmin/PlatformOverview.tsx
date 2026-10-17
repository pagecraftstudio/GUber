import React from 'react';
import { Company, SubscriptionPlan, AuditLog } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Badge } from '../common/Badge';
import { Building2, Bus, CalendarDays, DollarSign, ArrowUpRight, ShieldCheck } from 'lucide-react';

interface PlatformOverviewProps {
  companies: Company[];
  plans: SubscriptionPlan[];
  auditLogs: AuditLog[];
  onNavigateTab: (tab: any) => void;
}

export const PlatformOverview: React.FC<PlatformOverviewProps> = ({
  companies,
  plans,
  auditLogs,
  onNavigateTab,
}) => {
  const { locale, t } = useLocale();

  const totalBuses = 18; // Aggregate across tenants
  const totalTrips = 540;
  const mrrEgp = companies.reduce((acc, c) => {
    const plan = plans.find((p) => p.id === c.planId);
    return acc + (plan?.monthlyFeeEgp || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* 4 Super Admin KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('totalCompanies')}</span>
            <Building2 className="w-4 h-4 text-[#3563E9]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {companies.length}
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">
              {t('trialPending')}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('totalBusesNetwork')}</span>
            <Bus className="w-4 h-4 text-[#0F9D8A]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {totalBuses}
            </span>
            <span className="text-[11px] text-slate-500">
              {t('fleetCoaches')}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('totalTripsNetwork')}</span>
            <CalendarDays className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {totalTrips}
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold">
              {t('thisSemesterPeak')}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('platformMonthlyMrr')}</span>
            <DollarSign className="w-4 h-4 text-[#14243A]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {mrrEgp.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{t('egp')}</span>
          </div>
        </div>
      </div>

      {/* Tenants Summary Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t('companiesDirectory')}</h3>
            <p className="text-xs text-slate-500">{t('operatorsProvisionedNotice')}</p>
          </div>
          <button
            onClick={() => onNavigateTab('companies')}
            className="text-xs font-semibold text-[#3563E9] hover:underline cursor-pointer"
          >
            {t('manageDirectory')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-4 text-start">{t('companyName')}</th>
                <th className="py-2.5 px-4 text-start">{t('subdomain')}</th>
                <th className="py-2.5 px-4 text-start">{t('plan')}</th>
                <th className="py-2.5 px-4 text-start">{t('onboardedDate')}</th>
                <th className="py-2.5 px-4 text-end">{t('tenantStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      {locale === 'ar' ? c.nameAr : c.nameEn}
                    </div>
                    <div className="text-slate-400 text-[11px]">{c.email}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {c.customDomain || `${c.slug}.malakybus.com`}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 uppercase text-[11px] bg-slate-100 px-2 py-0.5 rounded">
                      {c.planId}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 tabular-nums">
                    {c.createdAt}
                  </td>
                  <td className="py-3 px-4 text-end">
                    <Badge status={c.status as any} label={t(c.status as any)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Platform Audit Logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">{t('auditLogs')}</h3>
          <button
            onClick={() => onNavigateTab('audit')}
            className="text-xs font-semibold text-[#3563E9] hover:underline cursor-pointer"
          >
            {t('fullAuditLog')}
          </button>
        </div>

        <div className="space-y-3">
          {auditLogs.slice(0, 4).map((log) => (
            <div
              key={log.id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-semibold text-slate-900">
                  {locale === 'ar' ? log.actionAr : log.action}
                </div>
                <div className="text-[11px] text-slate-500">
                  <span>{t('actor')}: {log.actor}</span>
                  <span className="mx-1.5">·</span>
                  <span>{t('companyName')}: {log.companyName}</span>
                  <span className="mx-1.5">·</span>
                  <span>{t('targetEntity')}: {log.target}</span>
                </div>
              </div>

              <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                {log.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
