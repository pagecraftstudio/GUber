export default function DashboardLoading() {
  return (
    <div aria-label="Loading dashboard page" aria-busy="true" className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-8 w-56 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}
