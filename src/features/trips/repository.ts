import { mapColumns } from '@/lib/db/columns';
import { rangeFor, type Page } from '@/lib/db/pagination';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { asRow, asRows, expectFound, expectList, expectMaybe, expectOne, expectPage } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import type { TripCreate, TripWithReturnsCreate, TripListQuery, TripTransitionInput, TripUpdate } from './schema';
import { TRIP_SELECT, toTrip, type Trip, type TripRow, type TripTransitioned } from './types';

export type TripRepository = {
  list(ctx: TenantServiceContext, q: TripListQuery): Promise<Page<Trip>>;
  get(ctx: TenantServiceContext, id: string): Promise<Trip | null>;
  createDraft(ctx: TenantServiceContext, input: TripCreate): Promise<Trip>;
  createWithReturns(ctx: TenantServiceContext, input: TripWithReturnsCreate): Promise<{ id: string; returnIds: string[] }>;
  listReturns(ctx: TenantServiceContext, outboundId: string): Promise<Trip[]>;
  update(ctx: TenantServiceContext, id: string, patch: TripUpdate): Promise<Trip>;
  transition(ctx: TenantServiceContext, input: TripTransitionInput): Promise<TripTransitioned>;
  deleteDraft(ctx: TenantServiceContext, id: string): Promise<void>;
};

// Whitelist = exactly the columns granted to `authenticated` in 0006, minus `status` and `template_id`.
const COLUMNS = {
  routeId: 'route_id',
  busId: 'bus_id',
  driverId: 'driver_id',
  departureAt: 'departure_at',
  arrivalAt: 'arrival_at',
  price: 'price',
  capacity: 'capacity',
  notes: 'notes',
} as const;

export const tripRepository: TripRepository = {
  async list(ctx, q) {
    let query = ctx.db.from('trips').select(TRIP_SELECT, { count: 'exact' }).eq('company_id', ctx.companyId);
    if (q.status) query = query.eq('status', q.status);
    if (q.routeId) query = query.eq('route_id', q.routeId);
    if (q.busId) query = query.eq('bus_id', q.busId);
    if (q.driverId) query = query.eq('driver_id', q.driverId);
    if (q.source) query = q.source === 'regular' ? query.not('template_id', 'is', null) : query.is('template_id', null);
    if (q.from) query = query.gte('departure_at', q.from);
    if (q.to) query = query.lt('departure_at', q.to);
    const { from, to } = rangeFor(q);
    return expectPage<TripRow, Trip>(asRows(await query.order('departure_at', { ascending: q.dir === 'asc' }).order('id').range(from, to)), toTrip, q);
  },

  async get(ctx, id) {
    return expectMaybe<TripRow, Trip>(
      asRow(await ctx.db.from('trips').select(TRIP_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle()),
      toTrip,
    );
  },

  async createDraft(ctx, input) {
    const row = { company_id: ctx.companyId, ...mapColumns(input, COLUMNS) }; // status: database default 'draft' (not a granted column)
    return expectOne<TripRow, Trip>(asRow(await ctx.db.from('trips').insert(row).select(TRIP_SELECT).single()), toTrip);
  },

  // One RPC (0029): the outbound and every return option are created in one transaction, linked by the database.
  async createWithReturns(ctx, i) {
    const { data, error } = await ctx.db.rpc('create_trip_with_returns', {
      p_route_id: i.routeId, p_bus_id: i.busId ?? null, p_driver_id: i.driverId ?? null, p_departure_at: i.departureAt, p_arrival_at: i.arrivalAt,
      p_price: i.price, p_capacity: i.capacity, p_notes: i.notes ?? null, p_round_trip_price: i.roundTripPrice,
      p_returns: i.returns.map((r) => ({ route_id: r.routeId, departure_at: r.departureAt, arrival_at: r.arrivalAt, price: r.price })),
    });
    if (error) throw mapDbError(error);
    if (data == null) throw new AppError('internal', { cause: new Error('rpc returned no data') });
    const r = data as { id: string; return_ids: string[] };
    return { id: r.id, returnIds: r.return_ids };
  },

  async listReturns(ctx, outboundId) {
    return expectList<TripRow, Trip>(asRows(await ctx.db.from('trips').select(TRIP_SELECT).eq('company_id', ctx.companyId).eq('outbound_trip_id', outboundId).order('departure_at')), toTrip);
  },

  async update(ctx, id, patch) {
    return expectFound<TripRow, Trip>(
      asRow(await ctx.db.from('trips').update(mapColumns(patch, COLUMNS)).eq('company_id', ctx.companyId).eq('id', id).select(TRIP_SELECT).maybeSingle()),
      toTrip,
    );
  },

  // Status changes and draft deletion are RPCs (0011): the machine, the booking cancellation and the conflict checks
  // run in the database, in one transaction. There is no client UPDATE of `status` and no client DELETE.
  async transition(ctx, i) {
    const { data, error } = await ctx.db.rpc('transition_trip', { p_trip_id: i.tripId, p_to: i.to, p_reason: i.reason ?? null });
    if (error) throw mapDbError(error);
    if (data == null) throw new AppError('internal', { cause: new Error('rpc returned no data') });
    const r = data as { id: string; status: TripTransitioned['status']; changed: boolean; bookings_cancelled: number };
    return { id: r.id, status: r.status, changed: r.changed, bookingsCancelled: r.bookings_cancelled };
  },

  async deleteDraft(ctx, id) {
    const { error } = await ctx.db.rpc('delete_draft_trip', { p_trip_id: id });
    if (error) throw mapDbError(error);
  },
};
