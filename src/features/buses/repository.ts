import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import type { BusCreate, BusListQuery, BusUpdate } from './schema';
import { BUS_SELECT, toBus, type Bus, type BusRow } from './types';

export type BusRepository = {
  list(ctx: TenantServiceContext, q: BusListQuery): Promise<Page<Bus>>;
  get(ctx: TenantServiceContext, id: string): Promise<Bus | null>;
  create(ctx: TenantServiceContext, input: BusCreate): Promise<Bus>;
  update(ctx: TenantServiceContext, id: string, patch: BusUpdate): Promise<Bus>;
};

const COLUMNS = {
  plateNumber: 'plate_number',
  name: 'name',
  capacity: 'capacity',
  make: 'make',
  model: 'model',
  year: 'year',
  status: 'status',
  notes: 'notes',
} as const;

export const busRepository: BusRepository = {
  async list(ctx, q) {
    let query = ctx.db.from('buses').select(BUS_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    const search = ilikeAny(['plate_number', 'name', 'make', 'model'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<BusRow, Bus>(await query.order(q.sort, { ascending: q.dir === 'asc' }).order('id').range(from, to), toBus, q);
  },

  async get(ctx, id) {
    return expectMaybe<BusRow, Bus>(
      await ctx.db.from('buses').select(BUS_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle(),
      toBus,
    );
  },

  async create(ctx, input) {
    const row = { company_id: ctx.companyId, ...mapColumns(input, COLUMNS) };
    return expectOne<BusRow, Bus>(await ctx.db.from('buses').insert(row).select(BUS_SELECT).single(), toBus);
  },

  async update(ctx, id, patch) {
    return expectFound<BusRow, Bus>(
      await ctx.db.from('buses').update(mapColumns(patch, COLUMNS)).eq('company_id', ctx.companyId).eq('id', id).select(BUS_SELECT).maybeSingle(),
      toBus,
    );
  },
};
