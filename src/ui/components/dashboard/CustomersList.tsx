import React, { useState } from 'react';
import { Customer } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Input } from '../common/Input';
import { Pagination } from '../common/Pagination';
import { GraduationCap, Phone, Mail, Award, Search, Users } from 'lucide-react';

interface CustomersListProps {
  customers: Customer[];
}

export const CustomersList: React.FC<CustomersListProps> = ({ customers }) => {
  const { locale, t } = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.studentId || '').toLowerCase().includes(q)
    );
  });

  const totalItems = filteredCustomers.length;
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('customers')}</h2>
          <p className="text-xs text-slate-500">
            {t('enrolledStudentsDesc')}
          </p>
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder={locale === 'ar' ? 'بحث بالاسم، الهاتف أو الكارنيه...' : 'Search student name, ID or phone...'}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {paginatedCustomers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200/80">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-800">{t('emptyTitle')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {locale === 'ar' ? 'لا يوجد ركاب يطابقون معايير البحث.' : 'No customer records match your query.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {paginatedCustomers.map((c) => (
            <div
              key={c.id}
              className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-[#3563E9] flex items-center justify-center font-bold text-xs shrink-0">
                    {c.fullName.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 leading-tight truncate">{c.fullName}</h4>
                    <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-1 rounded inline-block mt-0.5">
                      {c.studentId || t('commuter')}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span dir="ltr" className="font-mono text-slate-800 tabular-nums">{c.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate text-slate-800">{c.email}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">{t('totalTrips')}</span>
                  <strong className="text-slate-900 tabular-nums">{c.totalTrips} {t('ridesCount')}</strong>
                </div>
                <div className="text-end">
                  <span className="text-slate-400 block text-[10px]">{t('totalSpent')}</span>
                  <strong className="text-slate-900 tabular-nums">{c.totalSpentEgp} {t('egp')}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalItems > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
        />
      )}
    </div>
  );
};
