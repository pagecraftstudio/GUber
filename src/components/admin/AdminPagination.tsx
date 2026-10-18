import Link from 'next/link';

/** Previous/next links that keep every other query parameter. `params` must already exclude `page`. */
export function AdminPagination({ basePath, params, page, pageSize, total }: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100';
  const off = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-400';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-xs text-slate-600">
      <span>{total.toLocaleString('en-US')} total · page {page} of {pages}</span>
      <span className="flex gap-2">
        {page > 1 ? <Link href={href(page - 1)} className={btn}>Previous</Link> : <span aria-disabled="true" className={off}>Previous</span>}
        {page < pages ? <Link href={href(page + 1)} className={btn}>Next</Link> : <span aria-disabled="true" className={off}>Next</span>}
      </span>
    </nav>
  );
}
