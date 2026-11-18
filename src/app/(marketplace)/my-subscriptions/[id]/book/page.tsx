import { notFound } from 'next/navigation';
import { requireCustomer } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService } from '@/features/my-subscriptions/service';
import { BookScreen } from '@/features/my-subscriptions/ui/Screens';

export const metadata = { title: 'Book a trip', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const auth = await requireCustomer();
  const subs = await memberSubscriptionService.mine({ db: await createClient(), userId: auth.userId });
  const sub = subs.find((s) => s.id === id && s.status === 'active');
  if (!sub) notFound();
  const today = new Date().toISOString().slice(0, 10);
  return <BookScreen sub={sub} today={today} />;
}
