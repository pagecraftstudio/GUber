import { notFound } from 'next/navigation';

/**
 * Admin screens with FAKE data (no login, no database) for looking at them on a real screen. Development and Vercel preview only (404 in production).
 * Buttons that call server actions still reach the real actions, which refuse: there is no session and the ids are not real. ?view=list|detail|suspended|none|new|edit
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin preview', robots: { index: false, follow: false } };

const allowed = () => process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';

export default async function AdminPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (!allowed()) notFound();
  async function noop() { 'use server'; }
  const Preview = process.env.DS_GALLERY === '1' ? (await import('@/components/admin/masar/AdminPreview')).AdminPreview : null;
  return Preview ? <Preview view={(await searchParams).view ?? 'list'} logoutAction={noop} /> : null;
}
