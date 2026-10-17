import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import type { DriverCreate, DriverListQuery, DriverUpdate } from './schema';
import { DRIVER_SELECT, toDriver, type Driver, type DriverRow } from './types';

export type DriverRepository = {
  list(ctx: TenantServiceContext, q: DriverListQuery): Promise<Page<Driver>>;
  get(ctx: TenantServiceContext, id: string): Promise<Driver | null>;
  create(ctx: TenantServiceContext, input: DriverCreate): Promise<Driver>;
  update(ctx: TenantServiceContext, id: string, patch: DriverUpdate): Promise<Driver>;
};

// user_id and photo_media_id are not in this map on purpose (see schema.ts).
const COLUMNS = {
  fullName: 'full_name',
  phone: 'phone',
  licenseNumber: 'license_number',
  licenseExpiry: 'license_expiry',
  status: 'status',
  notes: 'notes',
} as const;

export const driverRepository: DriverRepository = {
  async list(ctx, q) {
    let query = ctx.db.from('drivers').select(DRIVER_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    const search = ilikeAny(['full_name', 'phone', 'license_number'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<DriverRow, Driver>(await query.order(q.sort, { ascending: q.dir === 'asc' }).order('id').range(from, to), toDriver, q);
  },

  async get(ctx, id) {
    return expectMaybe<DriverRow, Driver>(
      await ctx.db.from('drivers').select(DRIVER_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle(),
      toDriver,
    );
  },

  async create(ctx, input) {
    const row = { company_id: ctx.companyId, ...mapColumns(input, COLUMNS) };
    return expectOne<DriverRow, Driver>(await ctx.db.from('drivers').insert(row).select(DRIVER_SELECT).single(), toDriver);
  },

  async update(ctx, id, patch) {
    return expectFound<DriverRow, Driver>(
      await ctx.db.from('drivers').update(mapColumns(patch, COLUMNS)).eq('company_id', ctx.companyId).eq('id', id).select(DRIVER_SELECT).maybeSingle(),
      toDriver,
    );
  },
};
