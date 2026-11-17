export type ValidityType = 'duration' | 'range';
export type SubscriptionStatus = 'pending' | 'active' | 'rejected' | 'cancelled' | 'expired';

export type RoutePlanRow = {
  id: string;
  route_id: string;
  name: string;
  price: number | string;
  validity_type: ValidityType;
  duration_months: number | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
  route: { name: string } | { name: string }[] | null;
};

export type RoutePlan = {
  id: string;
  routeId: string;
  routeName: string;
  name: string;
  price: number;
  validityType: ValidityType;
  durationMonths: number | null;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  createdAt: string;
};

/** `route:routes!route_plans_route_fk(name)` embeds the go route's name through the composite FK. */
export const PLAN_SELECT = 'id,route_id,name,price,validity_type,duration_months,starts_on,ends_on,is_active,created_at,route:routes!route_plans_route_fk(name)';

export const toRoutePlan = (r: RoutePlanRow): RoutePlan => {
  const route = Array.isArray(r.route) ? r.route[0] : r.route;
  return {
    id: r.id,
    routeId: r.route_id,
    routeName: route?.name ?? '',
    name: r.name,
    price: Number(r.price),
    validityType: r.validity_type,
    durationMonths: r.duration_months,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
};

export type SubscriptionRow = {
  id: string;
  plan_id: string;
  plan_name: string | null;
  route_name: string | null;
  masar_id: string;
  member_name: string;
  member_phone: string;
  status: SubscriptionStatus;
  price: number | string;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
};

export type RouteSubscription = {
  id: string;
  planId: string;
  planName: string;
  routeName: string;
  masarId: string;
  memberName: string;
  memberPhone: string;
  status: SubscriptionStatus;
  price: number;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
};

export const SUBSCRIPTION_SELECT = 'id,plan_id,plan_name,route_name,masar_id,member_name,member_phone,status,price,currency,valid_from,valid_to,requested_at,decided_at,decision_note';

export const toSubscription = (r: SubscriptionRow): RouteSubscription => ({
  id: r.id,
  planId: r.plan_id,
  planName: r.plan_name ?? '',
  routeName: r.route_name ?? '',
  masarId: r.masar_id,
  memberName: r.member_name,
  memberPhone: r.member_phone,
  status: r.status,
  price: Number(r.price),
  currency: r.currency,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  requestedAt: r.requested_at,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
});
