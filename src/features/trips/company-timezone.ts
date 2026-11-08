import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';

/** The company's IANA time zone (0031: readable by anyone who can read the company's trips). Never guessed: a failure is an error. */
export async function companyTimeZone(ctx: TenantServiceContext): Promise<string> {
  const { data, error } = await ctx.db.rpc('company_timezone', { p_company_id: ctx.companyId });
  if (error) throw mapDbError(error);
  if (typeof data !== 'string' || data === '') throw new AppError('internal', { cause: new Error('company_timezone returned no value') });
  return data;
}
