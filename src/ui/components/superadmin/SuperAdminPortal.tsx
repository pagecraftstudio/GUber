import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Company, SubscriptionPlan, CustomDomain, AuditLog } from '../../types';
import { SuperAdminLayout, SuperAdminTab } from './SuperAdminLayout';
import { PlatformOverview } from './PlatformOverview';
import { CompaniesDirectory } from './CompaniesDirectory';
import { SubscriptionsManager } from './SubscriptionsManager';
import { CustomDomainsManager } from './CustomDomainsManager';
import { AuditLogsView } from './AuditLogsView';
import { ToastContainer, ToastMessage } from '../common/Toast';

export const SuperAdminPortal: React.FC = () => {
  const { companies, reloadCompanies } = useTenant();
  const [currentTab, setCurrentTab] = useState<SuperAdminTab>('overview');

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `toast_${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadData = async () => {
    const [p, d, a] = await Promise.all([
      transportService.getSubscriptionPlans(),
      transportService.getCustomDomains(),
      transportService.getAuditLogs(),
    ]);
    setPlans(p);
    setDomains(d);
    setAuditLogs(a);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([reloadCompanies(), loadData()]);
    addToast('success', 'Changes updated successfully');
  };

  return (
    <SuperAdminLayout currentTab={currentTab} onTabChange={(tab) => setCurrentTab(tab)}>
      {currentTab === 'overview' && (
        <PlatformOverview
          companies={companies}
          plans={plans}
          auditLogs={auditLogs}
          onNavigateTab={(tab) => setCurrentTab(tab)}
        />
      )}

      {currentTab === 'companies' && (
        <CompaniesDirectory
          companies={companies}
          plans={plans}
          onRefresh={handleRefresh}
        />
      )}

      {currentTab === 'plans' && (
        <SubscriptionsManager plans={plans} />
      )}

      {currentTab === 'domains' && (
        <CustomDomainsManager
          domains={domains}
          companies={companies}
          onRefresh={handleRefresh}
        />
      )}

      {currentTab === 'audit' && (
        <AuditLogsView auditLogs={auditLogs} />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </SuperAdminLayout>
  );
};
