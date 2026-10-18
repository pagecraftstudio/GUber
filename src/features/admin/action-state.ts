/**
 * State returned by every admin Server Action. Kept out of the 'use server' file because a client component needs
 * the IDLE value, and a 'use server' module may only export async functions.
 * `inviteUrl` carries an invite token (a credential): it lives in this in-memory React state only. It is never put in
 * a cookie, a URL, a log line or the database, so closing the page discards it ("shown once").
 */
export type AdminActionState = {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  /** field name -> stable error code (see components/admin/messages.ts) */
  fields?: Record<string, string>;
  companyId?: string;
  inviteUrl?: string;
  inviteExpiresAt?: string;
};

export const IDLE: AdminActionState = { status: 'idle' };
