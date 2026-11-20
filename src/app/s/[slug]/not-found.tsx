/** One generic answer for unknown slug, suspended company, never-published and unpublished site. Reveals nothing about the tenant. */
export default function TenantNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-page px-4 text-center text-ink-primary">
      <div className="space-y-2"><h1 className="text-2xl font-semibold">404</h1><p>الصفحة غير موجودة · Page not found</p></div>
    </main>
  );
}
