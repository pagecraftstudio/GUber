import React from 'react';
import { AuditLog } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { History, Shield } from 'lucide-react';

interface AuditLogsViewProps {
  auditLogs: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ auditLogs }) => {
  const { locale, t } = useLocale();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('auditLogs')}</h2>
        <p className="text-xs text-slate-500">
          Immutable platform event ledger recording security, dispatch mutations, and billing adjustments.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">{t('timestamp')}</th>
                <th className="py-3 px-4 text-start">{t('actor')}</th>
                <th className="py-3 px-4 text-start">Company</th>
                <th className="py-3 px-4 text-start">Action Executed</th>
                <th className="py-3 px-4 text-end">Target Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-slate-500 tabular-nums">
                    {log.timestamp}
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900">{log.actor}</span>
                    <span className="text-slate-400 text-[11px] block capitalize">
                      {log.role.replace('_', ' ')}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-medium text-slate-800">
                    {log.companyName}
                  </td>

                  <td className="py-3 px-4 font-medium text-slate-900">
                    {locale === 'ar' ? log.actionAr : log.action}
                  </td>

                  <td className="py-3 px-4 text-end font-mono text-slate-600">
                    {log.target}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
