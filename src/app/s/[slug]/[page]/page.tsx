import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { renderSitePage, siteMetadata } from '@/features/site/render';

type Props = { params: Promise<{ slug: string; page: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PAGE_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, page }, sp] = await Promise.all([params, searchParams]);
  return PAGE_SLUG_RE.test(page) ? siteMetadata(slug, page, sp) : { robots: { index: false, follow: false } };
}
export default async function TenantPage({ params, searchParams }: Props) {
  const [{ slug, page }, sp] = await Promise.all([params, searchParams]);
  if (!PAGE_SLUG_RE.test(page)) notFound();
  return renderSitePage(slug, page, sp);
}
