/**
 * Canonical entry points. One place, so a login path is never typed by hand in two files.
 *   '/'              public customer marketplace (no session needed)
 *   '/login'         customer sign in      '/register'  customer sign up
 *   '/my-bookings'   customer portal (bookings, tickets, QR) - server-guarded
 *   '/company/login' operator sign in: company staff, drivers, platform admins
 */
export const MARKETPLACE_PATH = '/';
export const CUSTOMER_LOGIN_PATH = '/login';
export const CUSTOMER_REGISTER_PATH = '/register';
export const CUSTOMER_HOME_PATH = '/my-bookings';
export const COMPANY_LOGIN_PATH = '/company/login';
