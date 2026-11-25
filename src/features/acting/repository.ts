import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/db/map-error';

export type ActingDb = { readonly db: SupabaseClient };

/** Thin wrappers over the 0065 RPCs. Postgres owns every rule (who may act, 30 minutes, read vs write); nothing here decides access. */
export const actingRepository = {
  async enter({ db }: ActingDb, companyId: string, reason: string): Promise<string> {
    const { data, error } = await db.rpc('platform_enter_acting', { p_company_id: companyId, p_reason: reason });
    if (error) throw mapDbError(error);
    return String(data);
  },
  async confirmWrite({ db }: ActingDb): Promise<void> {
    const { error } = await db.rpc('platform_confirm_acting_write');
    if (error) throw mapDbError(error);
  },
  async exit({ db }: ActingDb): Promise<void> {
    const { error } = await db.rpc('platform_exit_acting');
    if (error) throw mapDbError(error);
  },
};
