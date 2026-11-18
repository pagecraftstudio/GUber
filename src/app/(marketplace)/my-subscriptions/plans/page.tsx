import { requireCustomer } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService } from '@/features/my-subscriptions/service';
import { PlansScreen } from '@/features/my-subscriptions/ui/Screens';

export const metadata = { title: 'Subscription plans', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const auth = await requireCustomer();
  const c = { db: await createClient(), userId: auth.userId };
  const [profile, plans] = await Promise.all([memberSubscriptionService.profile(c), memberSubscriptionService.publicPlans(c)]);
  return <PlansScreen plans={plans} hasPhone={!!profile.phone} />;
}
