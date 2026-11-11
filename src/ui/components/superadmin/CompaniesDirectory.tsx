import React, { useState } from 'react';
import { Company, SubscriptionPlan } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Building2, Search, Edit2, ShieldAlert, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';

interface CompaniesDirectoryProps {
  companies: Company[];
  plans: SubscriptionPlan[];
  onRefresh: () => void;
}

export const CompaniesDirectory: React.FC<CompaniesDirectoryProps> = ({
  companies,
  plans,
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const { selectCompany, setActiveView } = useTenant();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [newStatus, setNewStatus] = useState<Company['status']>('active');
  const [newPlanId, setNewPlanId] = useState<Company['planId']>('growth');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Destructive suspension dialog
  const [companyToSuspend, setCompanyToSuspend] = useState<Company | null>(null);
  const [suspendLoading, setSuspendLoading] = useState(false);

  const filteredCompanies = companies.filter((c) => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.nameEn.toLowerCase().includes(q) ||
      c.nameAr.includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleOpenEdit = (c: Company) => {
    setSelectedCompany(c);
    setNewStatus(c.status);
    setNewPlanId(c.planId);
    setIsModalOpen(true);
  };

  const handleSaveCompanyChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    // If changing to suspended, require explicit confirmation
    if (newStatus === 'suspended' && selectedCompany.status !== 'suspended') {
      setIsModalOpen(false);
      setCompanyToSuspend(selectedCompany);
      return;
    }

    await transportService.updateCompany(selectedCompany.id, {
      status: newStatus,
      planId: newPlanId,
    });
    setIsModalOpen(false);
    onRefresh();
  };

  const handleConfirmSuspension = async () => {
    if (!companyToSuspend) return;
    setSuspendLoading(true);
    try {
      await transportService.updateCompany(companyToSuspend.id, {
        status: 'suspended',
      });
      setSuspendLoading(false);
      setCompanyToSuspend(null);
      onRefresh();
    } catch {
      setSuspendLoading(false);
    }
  };

  const handleJumpToDashboard = (c: Company) => {
    selectCompany(c.id);
    setActiveView('dashboard');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {t('companiesDirectory')}
          </h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar'
              ? 'إدارة مشغلي الحافلات، حالة الاشتراك، والنطاقات المستقلة.'
              : 'Provision, manage status, and adjust subscription allocations for bus operators.'}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'active', 'trial', 'suspended'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#14243A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? t('all') : t(st as any)}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder={locale === 'ar' ? 'بحث باسم الشركة أو النطاق...' : 'Search operator or slug...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">Operator Name</th>
                <th className="py-3 px-4 text-start">Domain / Slug</th>
                <th className="py-3 px-4 text-start">Contact Hotline</th>
                <th className="py-3 px-4 text-start">Subscription Tier</th>
                <th className="py-3 px-4 text-start">{t('status')}</th>
                <th className="py-3 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    {t('emptyTitle')}
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((company) => {
                  const plan = plans.find((p) => p.id === company.planId);

                  return (
                    <tr key={company.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">
                          {locale === 'ar' ? company.nameAr : company.nameEn}
                        </div>
                        <div className="text-slate-400 text-[11px] font-mono mt-0.5">
                          {company.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {company.customDomain || `${company.slug}.malakybus.com`}
                      </td>

                      <td className="py-3.5 px-4 tabular-nums font-mono text-slate-700" dir="ltr">
                        {company.phone}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {locale === 'ar' ? plan?.nameAr : plan?.nameEn}
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {plan?.monthlyFeeEgp} {t('egp')}/mo
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge status={company.status as any} label={company.status} />
                      </td>

                      <td className="py-3.5 px-4 text-end">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleJumpToDashboard(company)}
                            className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                            title={t('openOperatorDashboard')}
                          >
                            <span>Dashboard</span>
                            <ExternalLink className="w-3 h-3 text-slate-500 rtl:rotate-180" />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(company)}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            title={t('manageStatusPlan')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('manageOperatorModal')}
        subtitle={selectedCompany ? `${selectedCompany.nameEn} (${selectedCompany.slug})` : ''}
      >
        <form onSubmit={handleSaveCompanyChanges} className="space-y-4">
          <Select
            label="Tenant Status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as any)}
            options={[
              { value: 'active', label: t('activeFullAccess') },
              { value: 'trial', label: t('trialMode') },
              { value: 'suspended', label: t('suspendedMode') },
            ]}
          />

          <Select
            label="Subscription Tier"
            value={newPlanId}
            onChange={(e) => setNewPlanId(e.target.value as any)}
            options={plans.map((p) => ({
              value: p.id,
              label: `${p.nameEn} (${p.monthlyFeeEgp} EGP/mo)`,
            }))}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              Save Account Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Suspension Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!companyToSuspend}
        onClose={() => setCompanyToSuspend(null)}
        onConfirm={handleConfirmSuspension}
        title="Suspend Operator Account"
        message={`Are you sure you want to suspend "${companyToSuspend?.nameEn}"? This will immediately disable their public passenger website and suspend online departures.`}
        confirmLabel="Suspend Operator"
        variant="danger"
        loading={suspendLoading}
      />
    </div>
  );
};
