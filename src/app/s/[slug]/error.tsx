'use client';

/** Outage or unexpected data: generic message, no detail (the cause is in the server log), never "not found". */
export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-page px-4 text-center text-ink-primary">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">الموقع غير متاح مؤقتًا · Temporarily unavailable</h1>
        <button type="button" onClick={reset} className="rounded-md border border-line-default px-4 py-2">إعادة المحاولة · Try again</button>
      </div>
    </main>
  );
}
