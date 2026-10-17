import { mapColumns } from '@/lib/db/columns';
import { mapDbError } from '@/lib/db/map-error';
import { expectFound, expectList, expectMaybe, expectOne } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import type { StopCreate, StopUpdate } from './schema';
import { STOP_SELECT, toStop, type Stop, type StopRow } from './types';

export type StopRepository = {
  listByRoute(ctx: TenantServiceContext, routeId: string): Promise<Stop[]>;
  get(ctx: TenantServiceContext, id: string): Promise<Stop | null>;
  create(ctx: TenantServiceContext, routeId: string, input: StopCreate): Promise<Stop>;
  update(ctx: TenantServiceContext, id: string, patch: StopUpdate): Promise<Stop>;
};

const UPDATE_COLUMNS = {
  name: 'name',
  address: 'address',
  latitude: 'latitude',
  longitude: 'longitude',
  stopType: 'stop_type',
  offsetMinutes: 'offset_minutes',
  isActive: 'is_active',
} as const;
const CREATE_COLUMNS = { ...UPDATE_COLUMNS, stopOrder: 'stop_order' } as const;

const MAX_STOPS_PER_ROUTE = 200;

export const stopRepository: StopRepository = {
  async listByRoute(ctx, routeId) {
    return expectList<StopRow, Stop>(
      await ctx.db
        .from('route_stops')
        .select(STOP_SELECT)
        .eq('company_id', ctx.companyId)
        .eq('route_id', routeId)
        .order('stop_order')
        .limit(MAX_STOPS_PER_ROUTE),
      toStop,
    );
  },

  async get(ctx, id) {
    return expectMaybe<StopRow, Stop>(
      await ctx.db.from('route_stops').select(STOP_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle(),
      toStop,
    );
  },

  async create(ctx, routeId, input) {
    let stopOrder = input.stopOrder;
    if (stopOrder === undefined) {
      // Append. Two concurrent appends can pick the same number; the unique constraint then rejects the
      // second one (conflict `stop_order_taken`), so the order is never silently duplicated.
      const last = await ctx.db
        .from('route_stops')
        .select('stop_order')
        .eq('company_id', ctx.companyId)
        .eq('route_id', routeId)
        .order('stop_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.error) throw mapDbError(last.error);
      stopOrder = ((last.data as { stop_order: number } | null)?.stop_order ?? 0) + 1;
    }
    const row = { company_id: ctx.companyId, route_id: routeId, ...mapColumns({ ...input, stopOrder }, CREATE_COLUMNS) };
    return expectOne<StopRow, Stop>(await ctx.db.from('route_stops').insert(row).select(STOP_SELECT).single(), toStop);
  },

  async update(ctx, id, patch) {
    return expectFound<StopRow, Stop>(
      await ctx.db
        .from('route_stops')
        .update(mapColumns(patch, UPDATE_COLUMNS))
        .eq('company_id', ctx.companyId)
        .eq('id', id)
        .select(STOP_SELECT)
        .maybeSingle(),
      toStop,
    );
  },
};
