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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface-card border-t border-line-hairline text-xs text-ink-muted">
      <div className="tabular-nums">
        {locale === 'ar' ? (
          <span>
            عرض <strong className="text-ink-primary font-semibold">{startIdx}</strong> إلى{' '}
            <strong className="text-ink-primary font-semibold">{endIdx}</strong> من إجمالي{' '}
            <strong className="text-ink-primary font-semibold">{totalItems}</strong>
          </span>
        ) : (
          <span>
            Showing <strong className="text-ink-primary font-semibold">{startIdx}</strong> to{' '}
            <strong className="text-ink-primary font-semibold">{endIdx}</strong> of{' '}
            <strong className="text-ink-primary font-semibold">{totalItems}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-md border border-line-default text-ink-secondary hover:bg-surface-page disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          aria-label="Previous Page"
        >
          <PrevIcon className="w-3.5 h-3.5" />
        </button>

        <span className="px-2 text-xs font-semibold text-ink-secondary tabular-nums">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-md border border-line-default text-ink-secondary hover:bg-surface-page disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          aria-label="Next Page"
        >
          <NextIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
