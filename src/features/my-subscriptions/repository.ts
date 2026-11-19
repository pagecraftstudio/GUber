import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/db/map-error';
import type { BookInput } from './schema';
import {
  toMemberNotice, toMySubscription, toPublicPlan, toSubscriberBooking, toTripOption,
  type DayState, type MemberNotice, type MemberNoticeRow, type MemberProfile, type MySubscription, type MySubscriptionRow, type PublicPlan, type PublicPlanRow, type SubscriberBooking,
  type SubscriberBookingRow, type TripOption, type TripOptionRow,
} from './types';

/** Every call runs as the signed-in member's own client: the database derives the member from auth.uid(). */
export type MemberDb = { readonly db: SupabaseClient };

async function rows<T>(p: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw mapDbError(error);
  return Array.isArray(data) ? (data as T[]) : [];
}

export const memberSubscriptionRepository = {
  async profile({ db }: MemberDb, userId: string): Promise<MemberProfile> {
    const { data, error } = await db.from('profiles').select('masar_id,phone,full_name').eq('id', userId).maybeSingle();
    if (error) throw mapDbError(error);
    if (!data) throw mapDbError({ code: 'P0002', message: 'profile not found' });
    return { masarId: data.masar_id as string, phone: (data.phone as string | null) ?? null, fullName: data.full_name as string };
  },
  async setPhone({ db }: MemberDb, userId: string, phone: string): Promise<void> {
    const { error } = await db.from('profiles').update({ phone }).eq('id', userId); // own row only (RLS) and only the granted column
    if (error) throw mapDbError(error);
  },
  async publicPlans({ db }: MemberDb): Promise<PublicPlan[]> {
    return (await rows<PublicPlanRow>(db.rpc('public_route_plans', { p_company_id: null }))).map(toPublicPlan);
  },
  async mine({ db }: MemberDb): Promise<MySubscription[]> {
    const [subs, zones, renewable] = await Promise.all([rows<MySubscriptionRow>(db.rpc('my_route_subscriptions')), rows<{ subscription_id: string; timezone: string }>(db.rpc('my_subscription_timezones')), rows<{ subscription_id: string }>(db.rpc('my_renewable_subscriptions'))]);
    const canRenew = new Set(renewable.map((r) => r.subscription_id));
    const zoneOf = new Map(zones.map((z) => [z.subscription_id, z.timezone]));
    return subs.map((s) => toMySubscription(s, zoneOf.get(s.id), canRenew.has(s.id)));
  },
  async notices({ db }: MemberDb): Promise<MemberNotice[]> {
    return (await rows<MemberNoticeRow>(db.rpc('my_notices', { p_limit: 20 }))).map(toMemberNotice);
  },
  async markNoticesRead({ db }: MemberDb): Promise<void> {
    const { error } = await db.rpc('mark_my_notices_read');
    if (error) throw mapDbError(error);
  },
  async request({ db }: MemberDb, planId: string): Promise<string> {
    const { data, error } = await db.rpc('request_route_subscription', { p_plan_id: planId });
    if (error) throw mapDbError(error);
    return data as string;
  },
  async cancel({ db }: MemberDb, id: string): Promise<void> {
    const { error } = await db.rpc('cancel_my_route_subscription', { p_id: id });
    if (error) throw mapDbError(error);
  },
  async outboundOptions({ db }: MemberDb, subscriptionId: string, day: string): Promise<TripOption[]> {
    return (await rows<TripOptionRow>(db.rpc('subscriber_outbound_options', { p_subscription_id: subscriptionId, p_day: day }))).map(toTripOption);
  },
  async returnOptions({ db }: MemberDb, subscriptionId: string, outboundTripId: string): Promise<TripOption[]> {
    return (await rows<TripOptionRow>(db.rpc('subscriber_return_options', { p_subscription_id: subscriptionId, p_outbound_trip_id: outboundTripId }))).map(toTripOption);
  },
  async dayState({ db }: MemberDb, subscriptionId: string, day: string): Promise<DayState> {
    const [r] = await rows<{ go_booked: boolean; return_booked: boolean }>(db.rpc('subscriber_day_state', { p_subscription_id: subscriptionId, p_day: day }));
    return { goBooked: r?.go_booked ?? false, returnBooked: r?.return_booked ?? false };
  },
  async bookings({ db }: MemberDb, subscriptionId: string): Promise<SubscriberBooking[]> {
    return (await rows<SubscriberBookingRow>(db.rpc('subscriber_bookings', { p_subscription_id: subscriptionId }))).map(toSubscriberBooking);
  },
  async book({ db }: MemberDb, i: BookInput): Promise<void> {
    const { error } = await db.rpc('create_my_subscriber_booking', {
      p_subscription_id: i.subscriptionId, p_outbound_trip_id: i.outboundTripId, p_return_trip_id: i.returnTripId ?? null,
    });
    if (error) throw mapDbError(error);
  },
  async cancelBooking({ db }: MemberDb, bookingId: string): Promise<void> {
    const { error } = await db.rpc('cancel_my_booking', { p_booking_id: bookingId, p_reason: null }); // 0030: cancelling one leg cancels the linked leg
    if (error) throw mapDbError(error);
  },
};
export type MemberSubscriptionRepository = typeof memberSubscriptionRepository;
