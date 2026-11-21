import { notFound } from 'next/navigation';
import { SITE_FONT_CLASSES } from '@/ds/fonts/site-fonts';
import { isSlug } from '@/lib/tenant/host';

/** The one render path for every tenant site, in path mode (/s/<slug>) and subdomain mode (proxy rewrite). Slug shape is checked before anything else. */
export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  return <div className={SITE_FONT_CLASSES}>{children}</div>;
}
