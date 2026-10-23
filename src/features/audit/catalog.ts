/**
 * What the UI knows about audit entries. Unknown actions still render (raw action string); the SQL suite 15 fails
 * when the log contains a namespace missing here, so the catalogue cannot silently fall behind new audit writers.
 */
export const AUDIT_NAMESPACES = ['company', 'subscription', 'invite', 'booking', 'trip', 'ticket'] as const;
export type AuditNamespace = (typeof AUDIT_NAMESPACES)[number];

export const NAMESPACE_LABEL: Record<AuditNamespace, string> = {
  company: 'Company',
  subscription: 'Subscription',
  invite: 'Invite',
  booking: 'Booking',
  trip: 'Trip',
  ticket: 'Ticket',
};

export const ACTOR_TYPES = ['platform_user', 'company_user', 'customer', 'system'] as const;
export type AuditActorType = (typeof ACTOR_TYPES)[number];
export const ACTOR_LABEL: Record<AuditActorType, string> = {
  platform_user: 'MALAKY staff',
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
  'ticket.boarded': 'Ticket boarded',
};

/** Human label, or the raw action when the catalogue does not know it (never hides an entry). */
export const actionLabel = (action: string): string => ACTION_LABEL[action] ?? action;

export const isKnownNamespace = (v: string): v is AuditNamespace => (AUDIT_NAMESPACES as readonly string[]).includes(v);
