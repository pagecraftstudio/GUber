import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Typed wrappers for the inbox RPCs of migration 0053. Nothing here sends a user id or company id: the database answers for auth.uid() only.
 * Row shape is exactly what my_inbox returns.
 */
export interface InboxItem {
  id: string;
  event_key: string | null;
  subject: string | null;
  body: string;
  /** an in-app path (the database refuses anything else) */
  link: string | null;
  created_at: string;
  is_read: boolean;
  company_name: string | null;
}
export const INBOX_PAGE = 20;

type Rpc<T> = { data: T | null; error: { code?: string; message: string } | null };

export class InboxError extends Error { constructor() { super('inbox'); this.name = 'InboxError'; } }

async function call<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = (await client.rpc(fn, args)) as Rpc<T>;
  if (error) throw new InboxError();       // the database message is never shown to the user
  return data as T;
}

export const fetchUnread = async (client: SupabaseClient): Promise<number> => Number(await call<number>(client, 'my_unread_count')) || 0;

export const fetchInbox = async (client: SupabaseClient, page?: { before: string; beforeId: string }): Promise<InboxItem[]> =>
  (await call<InboxItem[]>(client, 'my_inbox', { p_limit: INBOX_PAGE, p_before: page?.before ?? null, p_before_id: page?.beforeId ?? null })) ?? [];

/** ids omitted = everything of mine that is unread */
export const markRead = async (client: SupabaseClient, ids?: string[]): Promise<number> =>
  Number(await call<number>(client, 'mark_my_notices_read', { p_ids: ids ?? null })) || 0;
