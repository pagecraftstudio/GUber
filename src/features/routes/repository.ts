import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import { mapDbError } from '@/lib/db/map-error';
import type { StopListSave } from '@/features/stops/schema';
import type { RouteCreate, RouteListQuery, RouteReturn, RouteUpdate } from './schema';
import { ROUTE_SELECT, toRoute, type Route, type RouteRow } from './types';

export type RouteRepository = {
  list(ctx: TenantServiceContext, q: RouteListQuery): Promise<Page<Route>>;
  get(ctx: TenantServiceContext, id: string): Promise<Route | null>;
  /** Route + stops in ONE database transaction (create_route_with_stops, 0025). Returns the new route id. */
  /** A route AND its return route in ONE transaction (create_route_pair, 0033). Returns both ids. Routes cannot be inserted any other way. */
  createPair(ctx: TenantServiceContext, input: RouteCreate, stops: StopListSave, ret: RouteReturn): Promise<{ routeId: string; returnRouteId: string }>;
  createWithStops(ctx: TenantServiceContext, input: RouteCreate, stops: StopListSave): Promise<string>;
  update(ctx: TenantServiceContext, id: string, patch: RouteUpdate): Promise<Route>;
};

const COLUMNS = {
  name: 'name',
  code: 'code',
  originName: 'origin_name',
  destinationName: 'destination_name',
  description: 'description',
  isActive: 'is_active',
} as const;

export const routeRepository: RouteRepository = {
  async list(ctx, q) {
    let query = ctx.db
      .from('routes')
      .select(ROUTE_SELECT, { count: 'exact' })
      .eq('company_id', ctx.companyId)
      .is('deleted_at', null); // RLS does not hide archived rows, the repository must
    if (q.isActive !== undefined) query = query.eq('is_active', q.isActive);
    const search = ilikeAny(['name', 'code', 'origin_name', 'destination_name'], q.q);
    if (search) query = query.or(search);
    const { from, to } = rangeFor(q);
    return expectPage<RouteRow, Route>(await query.order(q.sort, { ascending: q.dir === 'asc' }).order('id').range(from, to), toRoute, q);
  },

  async get(ctx, id) {
    return expectMaybe<RouteRow, Route>(
      await ctx.db.from('routes').select(ROUTE_SELECT).eq('company_id', ctx.companyId).eq('id', id).is('deleted_at', null).maybeSingle(),
      toRoute,
    );
  },

  async createPair(ctx, input, stops, ret) {
    // No company id is sent: the RPC derives it from the caller's membership (and checks routes.write).
    const returnSpec = ret.sameAsReverse
      ? { sameAsReverse: true, name: ret.name, code: ret.code, description: ret.description }
      : { sameAsReverse: false, name: ret.name, code: ret.code, description: ret.description, origin: ret.originName, destination: ret.destinationName, stops: ret.stops };
    const { data, error } = await ctx.db.rpc('create_route_pair', {
      p_name: input.name, p_code: input.code ?? null, p_origin: input.originName, p_destination: input.destinationName,
      p_description: input.description ?? null, p_stops: stops, p_return: returnSpec,
    });
    if (error) throw mapDbError(error);
    const d = data as { route_id?: unknown; return_route_id?: unknown } | null;
    if (typeof d?.route_id !== 'string' || typeof d?.return_route_id !== 'string') throw mapDbError({ message: 'empty create_route_pair result' });
    return { routeId: d.route_id, returnRouteId: d.return_route_id };
  },

  async createWithStops(ctx, input, stops) {
    // No company id is sent: the RPC derives it from the caller's membership (and checks routes.write).
    const { data, error } = await ctx.db.rpc('create_route_with_stops', {
      p_name: input.name, p_code: input.code ?? null, p_origin: input.originName, p_destination: input.destinationName, p_description: input.description ?? null, p_stops: stops,
    });
    if (error) throw mapDbError(error);
    const id = (data as { route_id?: unknown } | null)?.route_id;
    if (typeof id !== 'string') throw mapDbError({ message: 'empty create_route_with_stops result' });
    return id;
  },

  async update(ctx, id, patch) {
    return expectFound<RouteRow, Route>(
      await ctx.db
        .from('routes')
        .update(mapColumns(patch, COLUMNS))
        .eq('company_id', ctx.companyId)
        .eq('id', id)
        .is('deleted_at', null)
        .select(ROUTE_SELECT)
        .maybeSingle(),
      toRoute,
    );
  },
};
