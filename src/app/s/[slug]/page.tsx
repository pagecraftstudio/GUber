import type { Metadata } from 'next';
import { renderSitePage, siteMetadata } from '@/features/site/render';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Tenant home. Rendered from get_public_site() (published snapshot only; drafts are unreachable from here). */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return siteMetadata(slug, null, sp);
}
export default async function TenantHome({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return renderSitePage(slug, null, sp);
}
