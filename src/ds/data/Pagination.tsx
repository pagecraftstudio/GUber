'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber, type Lang } from '../format';
import { useDsLang, useDsText } from '../lang';
import { buttonClass } from '../primitives/Button';
import { cx, FOCUS } from '../primitives/cx';

/** Links when `hrefFor` is given (server pages with URL filters), buttons when `onPageChange` is. Page numbers follow the language. */
export function Pagination({ page, pageCount, hrefFor, onPageChange, lang }: { page: number; pageCount: number; hrefFor?: (page: number) => string; onPageChange?: (page: number) => void; lang?: Lang }) {
  const l = useDsLang(lang);
  const t = useDsText(lang);
  if (pageCount <= 1) return null;
  const item = (target: number, content: React.ReactNode, label: string, disabled: boolean, current = false) => {
    const cls = cx(buttonClass('secondary', 'md', false, 'min-w-9 px-2'), current && '!border-action !bg-action !text-on-action', disabled && 'pointer-events-none opacity-60');
    if (hrefFor && !disabled) return <a key={label} href={hrefFor(target)} aria-label={label} aria-current={current ? 'page' : undefined} className={cls}>{content}</a>;
    return <button key={label} type="button" aria-label={label} aria-current={current ? 'page' : undefined} aria-disabled={disabled || undefined} disabled={disabled && !hrefFor} onClick={() => !disabled && onPageChange?.(target)} className={cx(cls, FOCUS)}>{content}</button>;
  };
  const near = [page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount);
  const nums = Array.from(new Set([1, ...near, pageCount])).sort((a, b) => a - b);
  return (
    <nav aria-label={t.pagination} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px] text-ink-muted">{t.page(formatNumber(page, l), formatNumber(pageCount, l))}</p>
      <div className="flex items-center gap-1">
        {item(page - 1, <ChevronLeft size={16} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden="true" />, t.previous, page <= 1)}
        {nums.map((n) => item(n, formatNumber(n, l), t.page(formatNumber(n, l), formatNumber(pageCount, l)), false, n === page))}
        {item(page + 1, <ChevronRight size={16} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden="true" />, t.next, page >= pageCount)}
      </div>
    </nav>
  );
}
