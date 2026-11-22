/**
 * What the UI knows about audit entries. Unknown actions still render (raw action string); the SQL suite 15 fails
 * when the log contains a namespace missing here, so the catalogue cannot silently fall behind new audit writers.
 */
export const AUDIT_NAMESPACES = ['company', 'subscription', 'invite', 'booking', 'trip', 'ticket', 'route', 'member', 'driver', 'route_plan', 'route_subscription', 'domain', 'website', 'media', 'identity', 'payment_settings'] as const;
export type AuditNamespace = (typeof AUDIT_NAMESPACES)[number];

export const NAMESPACE_LABEL: Record<AuditNamespace, string> = {
  company: 'Company',
  subscription: 'Subscription',
  invite: 'Invite',
  booking: 'Booking',
  trip: 'Trip',
  ticket: 'Ticket',
  route: 'Route',
  route_plan: 'Subscription plan',
  route_subscription: 'Rider subscription',
  member: 'Team member',
  driver: 'Driver',
  domain: 'Domain',
  website: 'Website',
  media: 'Media',
  identity: 'Identity scan',
  payment_settings: 'Payment settings',
};

export const ACTOR_TYPES = ['platform_user', 'company_user', 'customer', 'system'] as const;
export type AuditActorType = (typeof ACTOR_TYPES)[number];
export const ACTOR_LABEL: Record<AuditActorType, string> = {
  platform_user: 'MASAR platform team',
  company_user: 'Company staff',
  customer: 'Customer',
  system: 'System',
};

const ACTION_LABEL: Record<string, string> = {
  'company.created': 'Company created',
  'company.updated': 'Company profile updated',
  'company.status_changed': 'Company status changed',
  'company.suspended': 'Company suspended',
  'company.reactivated': 'Company reactivated',
  'company.cancelled': 'Company cancelled',
  'company.note_added': 'Internal note added',
  'subscription.assigned': 'Plan assigned',
  'subscription.status_changed': 'Subscription status changed',
  'subscription.cancelled': 'Subscription cancelled',
  'subscription.expired': 'Subscription expired',
  'subscription.period_changed': 'Subscription period changed',
  'invite.created': 'Invite created',
  'invite.accepted': 'Invite accepted',
  'invite.revoked': 'Invite revoked',
  'booking.created': 'Booking created',
  'booking.confirmed': 'Booking confirmed',
  'booking.cancelled': 'Booking cancelled',
  'booking.payment_status': 'Booking payment status changed',
  'booking.amount_paid': 'Booking paid amount changed',
  'ticket.boarded': 'Ticket boarded',
  'identity.scanned': 'Passenger identity scanned',
  'payment_settings.saved': 'Payment settings saved',
  'route.stops_saved': 'Route stops saved',
  'route.pair_created': 'Route and return route created',
  'route_plan.created': 'Subscription plan created',
  'route_plan.updated': 'Subscription plan updated',
  'route_plan.archived': 'Subscription plan archived',
  'route_subscription.requested': 'Subscription requested',
  'route_subscription.approved': 'Subscription approved',
  'route_subscription.rejected': 'Subscription rejected',
  'route_subscription.cancelled': 'Subscription cancelled',
  'route_subscription.scanned': 'Subscription scanned',
  'member.role_changed': 'Member role changed',
  'member.status_changed': 'Member status changed',
  'driver.linked': 'Driver linked to login',
  'domain.add': 'Custom domain added',
  'domain.remove': 'Custom domain removed',
  'domain.set_primary': 'Primary domain changed',
  'domain.verify': 'Domain DNS check recorded',
  'domain.activate': 'Domain activated',
  'domain.disable': 'Domain disabled',
  'website.publish': 'Website published',
  'website.rollback': 'Website rolled back',
  'website.unpublish': 'Website unpublished',
  'media.upload': 'Image uploaded',
  'media.discard': 'Image removed',
};

/** Human label, or the raw action when the catalogue does not know it (never hides an entry). */
export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

export const isKnownNamespace = (v: string): v is AuditNamespace => (AUDIT_NAMESPACES as readonly string[]).includes(v);
