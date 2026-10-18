const STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  trial: 'border-amber-200 bg-amber-50 text-amber-700',
  trialing: 'border-amber-200 bg-amber-50 text-amber-700',
  past_due: 'border-orange-200 bg-orange-50 text-orange-700',
  suspended: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
  expired: 'border-slate-200 bg-slate-100 text-slate-600',
  live: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stale: 'border-red-200 bg-red-50 text-red-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.cancelled}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
