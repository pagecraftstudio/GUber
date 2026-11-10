import { notFound } from 'next/navigation';

/**
 * Driver screen preview with FAKE data, so the boarding screen can be judged on a real phone (sunlight, thumb reach, camera) without a login
 * or a Supabase project. Development and Vercel preview only (404 in production); nothing is sent anywhere.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Driver preview', robots: { index: false, follow: false } };

function allowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.VERCEL_ENV === 'preview';
}

export default async function DriverPreviewPage() {
  if (!allowed()) notFound();
  // replaced at build time (next.config.ts): in production this import is dead code and never bundled
  const Preview = process.env.DS_GALLERY === '1' ? (await import('@/features/driver/masar/DriverPreview')).DriverPreview : null;
  return Preview ? <Preview /> : null;
}
