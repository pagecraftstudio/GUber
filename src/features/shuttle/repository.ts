import { expectList, expectMaybe } from '@/lib/db/query';
import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import type { FaresSave, ServiceActive, ServiceSave } from './schema';
import { FARE_SELECT, SERVICE_SELECT, toFare, toService, type ShuttleFare, type ShuttleFareRow, type ShuttleService, type ShuttleServiceRow } from './types';

export type ShuttleRepository = {
  isEnabled(ctx: TenantServiceContext): Promise<boolean>;
  liveServiceForRoute(ctx: TenantServiceContext, routeId: string): Promise<ShuttleService | null>;
  listFares(ctx: TenantServiceContext, serviceId: string): Promise<ShuttleFare[]>;
  saveService(ctx: TenantServiceContext, i: ServiceSave): Promise<string>;
  setServiceActive(ctx: TenantServiceContext, i: ServiceActive): Promise<void>;
  saveFares(ctx: TenantServiceContext, i: FaresSave): Promise<number>;
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
};
