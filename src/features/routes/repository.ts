import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { expectFound, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import { ilikeAny } from '@/lib/db/search';
import type { TenantServiceContext } from '@/lib/service/context';
import type { RouteCreate, RouteListQuery, RouteUpdate } from './schema';
import { ROUTE_SELECT, toRoute, type Route, type RouteRow } from './types';

export type RouteRepository = {
  list(ctx: TenantServiceContext, q: RouteListQuery): Promise<Page<Route>>;
  get(ctx: TenantServiceContext, id: string): Promise<Route | null>;
  create(ctx: TenantServiceContext, input: RouteCreate): Promise<Route>;
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

  async create(ctx, input) {
    const row = { company_id: ctx.companyId, ...mapColumns(input, COLUMNS) };
    return expectOne<RouteRow, Route>(await ctx.db.from('routes').insert(row).select(ROUTE_SELECT).single(), toRoute);
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
