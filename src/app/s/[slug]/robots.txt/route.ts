import { readTenantConfig } from '@/lib/tenant/config';
import { isSlug } from '@/lib/tenant/host';
import { tenantUrl } from '@/lib/tenant/url';
import { getPublicSite } from '@/features/site/data';

/**
 * Per-tenant robots.txt. Reachable as /robots.txt only in subdomain mode (the proxy rewrites every path on a tenant host under
 * /s/<slug>); in path mode crawlers never ask for it here, and the answer is "disallow everything" anyway. An unpublished or unknown
 * site gets the same 404 as any other path.
 */
export const dynamic = 'force-dynamic';
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) return text('Not found', 404);
  const cfg = readTenantConfig(process.env);
  if (cfg.mode === 'path') return text('User-agent: *\nDisallow: /\n');
  const site = await getPublicSite(slug);
  if (!site) return text('Not found', 404);
  return text(`User-agent: *\nAllow: /\n\nSitemap: ${tenantUrl(cfg, site.company.slug, '/sitemap.xml')}\n`);
}
