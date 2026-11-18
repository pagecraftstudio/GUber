'use client';
import type { MemberProfile, MySubscription, PublicPlan, SubscriberBooking } from '../types';
import { BookView } from './BookView';
import { MemberShell } from './MemberShell';
import { MySubscriptionsView } from './MySubscriptionsView';
import { PlansView } from './PlansView';

/** Client wrappers: a server page can only pass serialisable props, so the language-aware render function lives here. */
export const MySubscriptionsScreen = (p: { profile: MemberProfile; subs: MySubscription[]; bookings: Record<string, SubscriberBooking[]> }) => (
  <MemberShell>{(lang) => <MySubscriptionsView lang={lang} {...p} />}</MemberShell>
);
export const PlansScreen = (p: { plans: PublicPlan[]; hasPhone: boolean }) => (
  <MemberShell backHref="/my-subscriptions">{(lang) => <PlansView lang={lang} {...p} />}</MemberShell>
);
export const BookScreen = (p: { sub: MySubscription; today: string }) => (
  <MemberShell backHref="/my-subscriptions">{(lang) => <BookView lang={lang} {...p} />}</MemberShell>
);
