import React, { useState } from 'react';
import { CustomDomain, Company } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Globe, Plus, ShieldCheck, Check, AlertCircle } from 'lucide-react';

interface CustomDomainsManagerProps {
  domains: CustomDomain[];
  companies: Company[];
  onRefresh: () => void;
}

export const CustomDomainsManager: React.FC<CustomDomainsManagerProps> = ({
  domains,
  companies,
  onRefresh,
}) => {
  const { locale, t } = useLocale();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(companies[0]?.id || '');
  const [domainName, setDomainName] = useState('shuttles.galalaexpress.com');

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    await transportService.addCustomDomain({
      companyId: selectedCompanyId,
      domain: domainName,
    });
    setIsModalOpen(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {t('customDomains')}
          </h2>
          <p className="text-xs text-slate-500">
            Multi-tenant routing, DNS CNAME verification, and automatic TLS/SSL certificate issuance.
          </p>
        </div>

        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>
          Add Custom Domain
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">Custom Domain Hostname</th>
                <th className="py-3 px-4 text-start">Assigned Operator</th>
                <th className="py-3 px-4 text-start">{t('dnsTarget')}</th>
                <th className="py-3 px-4 text-start">{t('sslCertificate')}</th>
                <th className="py-3 px-4 text-end">DNS Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {domains.map((dom) => {
                const comp = companies.find((c) => c.id === dom.companyId);

                return (
                  <tr key={dom.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {dom.domain}
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-800">
                      {locale === 'ar' ? comp?.nameAr : comp?.nameEn}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-500">
                      {dom.cnameTarget}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        TLS {dom.sslStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-end">
                      <Badge status={dom.status as any} label={dom.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Tenant Custom Domain"
        subtitle="Route a white-label domain name to an operator's public booking portal."
      >
        <form onSubmit={handleAddDomain} className="space-y-4">
          <Select
            label="Target Operator"
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.nameEn }))}
          />

          <Input
            label="Domain Hostname (FQDN)"
            placeholder="e.g. travel.buscompany.com"
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            helperText="The operator must add a CNAME record pointing to cname.malakybus.com"
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              Verify & Add Domain
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
