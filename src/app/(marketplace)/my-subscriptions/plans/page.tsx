import { requireCustomer } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService } from '@/features/my-subscriptions/service';
import { PlansScreen } from '@/features/my-subscriptions/ui/Screens';
import { planFocus } from '@/features/my-subscriptions/plan-focus';

export const metadata = { title: 'Subscription plans', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * `?plan=<id>` comes from a company's website ("Request subscription"). It only chooses WHICH plans to list (that company's) and which one
 * to highlight; it grants nothing: requesting still goes through the signed-in member's own action and the database re-checks the plan.
 * A signed-out visitor is sent to sign in and brought back to exactly this address.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const asked = Array.isArray(sp.plan) ? sp.plan[0] : sp.plan;
  const focus = planFocus(asked);
  const auth = await requireCustomer(focus ? `/my-subscriptions/plans?plan=${focus}` : '/my-subscriptions/plans');
  const c = { db: await createClient(), userId: auth.userId };
  const [profile, all] = await Promise.all([memberSubscriptionService.profile(c), memberSubscriptionService.publicPlans(c)]);
  const chosen = focus ? all.find((p) => p.planId === focus) : undefined;
  const plans = chosen ? all.filter((p) => p.companyId === chosen.companyId) : all;
  return <PlansScreen plans={plans} hasPhone={!!profile.phone} highlightPlanId={chosen?.planId ?? null} />;
}
