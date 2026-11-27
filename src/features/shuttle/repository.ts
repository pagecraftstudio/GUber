import { expectList, expectMaybe } from '@/lib/db/query';
import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import type { CancelDay, FaresSave, OverviewQuery, ServiceActive, ServiceSave, StartDay } from './schema';
import { FARE_SELECT, SERVICE_SELECT, toFare, toOverview, toService, toStartResult, type ShuttleOverview, type StartDayResult, type ShuttleFare, type ShuttleFareRow, type ShuttleService, type ShuttleServiceRow } from './types';

export type ShuttleRepository = {
  isEnabled(ctx: TenantServiceContext): Promise<boolean>;
  liveServiceForRoute(ctx: TenantServiceContext, routeId: string): Promise<ShuttleService | null>;
  listFares(ctx: TenantServiceContext, serviceId: string): Promise<ShuttleFare[]>;
  saveService(ctx: TenantServiceContext, i: ServiceSave): Promise<string>;
  setServiceActive(ctx: TenantServiceContext, i: ServiceActive): Promise<void>;
  saveFares(ctx: TenantServiceContext, i: FaresSave): Promise<number>;
  listLiveServices(ctx: TenantServiceContext): Promise<ShuttleService[]>;
  overview(ctx: TenantServiceContext, q: OverviewQuery): Promise<ShuttleOverview>;
  startDay(ctx: TenantServiceContext, i: StartDay): Promise<StartDayResult>;
  cancelDay(ctx: TenantServiceContext, i: CancelDay): Promise<void>;
};

export const shuttleRepository: ShuttleRepository = {
  async isEnabled(ctx) {
    // The company comes from the session; the RPC answers false for anyone without shuttle.read.
    const { data, error } = await ctx.db.rpc('shuttle_is_enabled', { p_company: ctx.companyId });
    if (error) throw mapDbError(error);
    return data === true;
  },

  async liveServiceForRoute(ctx, routeId) {
    const res = await ctx.db.from('shuttle_services').select(SERVICE_SELECT).eq('company_id', ctx.companyId).eq('route_id', routeId).eq('is_active', true).maybeSingle();
    return expectMaybe<ShuttleServiceRow, ShuttleService>(res as never, toService);
  },

  async listFares(ctx, serviceId) {
    const res = await ctx.db.from('shuttle_fares').select(FARE_SELECT).eq('company_id', ctx.companyId).eq('service_id', serviceId).order('id').limit(2000);
    return expectList<ShuttleFareRow, ShuttleFare>(res as never, toFare);
  },

  async saveService(ctx, i) {
    // The RPC derives the company from the route and checks shuttle.config + the plan feature.
    const { data, error } = await ctx.db.rpc('shuttle_save_service', {
      p_route_id: i.routeId, p_name: i.name, p_outbound_direction: i.outboundDirection, p_allow_reverse: i.allowReverse,
      p_request_ttl_minutes: i.requestTtlMinutes, p_allow_walk_in: i.allowWalkIn, p_max_seats_per_request: i.maxSeatsPerRequest,
      p_hub_stop_id: i.hubStopId,
    });
    if (error) throw mapDbError(error);
    if (typeof data !== 'string') throw mapDbError({ message: 'empty shuttle_save_service result' });
    return data;
  },

  async setServiceActive(ctx, i) {
    const { error } = await ctx.db.rpc('shuttle_set_service_active', { p_service_id: i.serviceId, p_active: i.active });
    if (error) throw mapDbError(error);
  },

  async saveFares(ctx, i) {
    const { data, error } = await ctx.db.rpc('shuttle_save_fares', {
      p_service_id: i.serviceId,
      p_fares: i.fares.map((f) => ({ from_stop_id: f.fromStopId, to_stop_id: f.toStopId, price: f.price })),
    });
    if (error) throw mapDbError(error);
    return typeof data === 'number' ? data : 0;
  },

  async listLiveServices(ctx) {
    const res = await ctx.db.from('shuttle_services').select(SERVICE_SELECT).eq('company_id', ctx.companyId).eq('is_active', true).order('name').order('id').limit(100);
    return expectList<ShuttleServiceRow, ShuttleService>(res as never, toService);
  },

  async overview(ctx, q) {
    const { data, error } = await ctx.db.rpc('shuttle_overview', { p_service_id: q.serviceId, p_date: q.date ?? null });
    if (error) throw mapDbError(error);
    return toOverview(data);
  },

  async startDay(ctx, i) {
    // The RPC derives the company from the service, checks shuttle.operate, the plan feature, the vehicle limit and every conflict.
    const { data, error } = await ctx.db.rpc('shuttle_start_day', {
      p_service_id: i.serviceId, p_service_date: i.serviceDate, p_key: i.key,
      p_vehicles: i.vehicles.map((v) => ({ bus_id: v.busId, driver_id: v.driverId, start_station_idx: v.startStationIdx, direction: v.direction })),
    });
    if (error) throw mapDbError(error);
    return toStartResult(data);
  },

  async cancelDay(ctx, i) {
    const { error } = await ctx.db.rpc('shuttle_cancel_day', { p_day_id: i.dayId, p_reason: i.reason });
    if (error) throw mapDbError(error);
  },
};
