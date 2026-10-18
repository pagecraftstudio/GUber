type Tone = 'neutral' | 'good' | 'warn' | 'bad';
const TONE: Record<Tone, string> = {
  neutral: 'text-slate-900',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
};

export function StatCard({ label, value, hint, tone = 'neutral' }: { label: string; value: number | string; hint?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE[tone]}`}>{typeof value === 'number' ? value.toLocaleString('en-US') : value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
