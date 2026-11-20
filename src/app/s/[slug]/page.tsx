import { notFound } from 'next/navigation';
import { resolveTenantBySlug } from '@/lib/tenant/resolve';

/**
 * M3C skeleton. Proves the route + tenant resolution end to end. M3D replaces the body with the published site rendered from
 * get_public_site(); until then no tenant content is shown.
 */
export default async function TenantHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  return <main data-tenant-slug={tenant.slug} />;
}
