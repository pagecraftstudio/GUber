import { readTenantConfig } from '@/lib/tenant/config';
import { isSlug } from '@/lib/tenant/host';
import { tenantUrl } from '@/lib/tenant/url';
import { getPublicSite } from '@/features/site/data';

/** Per-tenant sitemap: the published pages only. Path mode serves none (nothing under /s/ is meant to be indexed). */
export const dynamic = 'force-dynamic';
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cfg = readTenantConfig(process.env);
  if (!isSlug(slug) || cfg.mode === 'path') return notFound();
  const site = await getPublicSite(slug);
  if (!site) return notFound();
  const urls = site.site.pages.map((p) => tenantUrl(cfg, site.company.slug, p.is_home ? '/' : `/${p.slug}`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xml(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
