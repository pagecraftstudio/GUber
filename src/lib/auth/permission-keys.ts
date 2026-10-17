/**
 * Typed names of the permission keys seeded in migration 0005. Services reference these constants instead of
 * string literals, so a typo is a compile error. A unit test compares this list with the SQL seed, so the two
 * cannot drift apart silently. Which role holds which key is DATA (role_permissions), never code.
 */
export const PERMISSIONS = {
  routesRead: 'routes.read',
  routesWrite: 'routes.write',
  busesRead: 'buses.read',
  busesWrite: 'buses.write',
  driversRead: 'drivers.read',
  driversWrite: 'drivers.write',
  tripsRead: 'trips.read',
  tripsWrite: 'trips.write',
  tripsReadAssigned: 'trips.read_assigned',
  customersRead: 'customers.read',
  customersWrite: 'customers.write',
  bookingsRead: 'bookings.read',
  bookingsWrite: 'bookings.write',
  websiteRead: 'website.read',
  websiteWrite: 'website.write',
  mediaRead: 'media.read',
  mediaWrite: 'media.write',
  usersRead: 'users.read',
  usersWrite: 'users.write',
  settingsRead: 'settings.read',
  settingsWrite: 'settings.write',
  domainsRead: 'domains.read',
  domainsWrite: 'domains.write',
  notificationsRead: 'notifications.read',
  notificationsWrite: 'notifications.write',
  billingRead: 'billing.read',
  auditRead: 'audit.read',
  analyticsRead: 'analytics.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
