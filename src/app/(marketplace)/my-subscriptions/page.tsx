import { requireCustomer } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService } from '@/features/my-subscriptions/service';
import { MySubscriptionsScreen } from '@/features/my-subscriptions/ui/Screens';

export const metadata = { title: 'My subscriptions', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MySubscriptionsPage() {
  const auth = await requireCustomer();
  const c = { db: await createClient(), userId: auth.userId };
  const [profile, subs] = await Promise.all([memberSubscriptionService.profile(c), memberSubscriptionService.mine(c)]);
  const active = subs.filter((s) => s.status === 'active');
  const lists = await Promise.all(active.map((s) => memberSubscriptionService.bookings(c, s.id)));
  const bookings = Object.fromEntries(active.map((s, i) => [s.id, lists[i] ?? []]));
  return <MySubscriptionsScreen profile={profile} subs={subs} bookings={bookings} />;
}
