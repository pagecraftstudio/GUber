import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  const { locale, dir } = useLocale();
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (totalPages <= 1) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-100 text-xs text-slate-500">
      <div className="tabular-nums">
        {locale === 'ar' ? (
          <span>
            عرض <strong className="text-slate-900 font-semibold">{startIdx}</strong> إلى{' '}
            <strong className="text-slate-900 font-semibold">{endIdx}</strong> من إجمالي{' '}
            <strong className="text-slate-900 font-semibold">{totalItems}</strong>
          </span>
        ) : (
          <span>
            Showing <strong className="text-slate-900 font-semibold">{startIdx}</strong> to{' '}
            <strong className="text-slate-900 font-semibold">{endIdx}</strong> of{' '}
            <strong className="text-slate-900 font-semibold">{totalItems}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          aria-label="Previous Page"
        >
          <PrevIcon className="w-3.5 h-3.5" />
        </button>

        <span className="px-2 text-xs font-semibold text-slate-700 tabular-nums">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          aria-label="Next Page"
        >
          <NextIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
