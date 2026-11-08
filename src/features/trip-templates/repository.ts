import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { asRow, asRows, expectFound, expectList, expectOne } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import type { TemplateCreate } from './schema';
import { TEMPLATE_SELECT, toTemplate, type GenerateResult, type TripTemplate, type TripTemplateRow } from './types';

export type TripTemplateRepository = {
  list(ctx: TenantServiceContext): Promise<TripTemplate[]>;
  create(ctx: TenantServiceContext, input: TemplateCreate): Promise<TripTemplate>;
  setActive(ctx: TenantServiceContext, id: string, isActive: boolean): Promise<TripTemplate>;
  generate(ctx: TenantServiceContext, id: string, days: number): Promise<GenerateResult>;
};

export const tripTemplateRepository: TripTemplateRepository = {
  async list(ctx) {
    return expectList<TripTemplateRow, TripTemplate>(
      asRows(await ctx.db.from('trip_templates').select(TEMPLATE_SELECT).eq('company_id', ctx.companyId).order('departure_time').order('name').limit(200)),
      toTemplate,
    );
  },

  async create(ctx, i) {
    const row = {
      company_id: ctx.companyId, name: i.name, route_id: i.routeId, bus_id: i.busId ?? null, driver_id: i.driverId ?? null,
      departure_time: i.departureTime, duration_minutes: i.durationMinutes, days_of_week: i.daysOfWeek,
      start_date: i.startDate, end_date: i.endDate ?? null, price: i.price, capacity: i.capacity,
    };
    return expectOne<TripTemplateRow, TripTemplate>(asRow(await ctx.db.from('trip_templates').insert(row).select(TEMPLATE_SELECT).single()), toTemplate);
  },

  async setActive(ctx, id, isActive) {
    return expectFound<TripTemplateRow, TripTemplate>(
      asRow(await ctx.db.from('trip_templates').update({ is_active: isActive }).eq('company_id', ctx.companyId).eq('id', id).select(TEMPLATE_SELECT).maybeSingle()),
      toTemplate,
    );
  },

  // The generator is an RPC (0028): it checks trips.write on the template's company, walks dates in the company time zone
  // and skips conflicts in the database. Nothing about trips is computed here.
  async generate(ctx, id, days) {
    const { data, error } = await ctx.db.rpc('generate_template_trips', { p_template_id: id, p_days: days });
    if (error) throw mapDbError(error);
    if (data == null) throw new AppError('internal', { cause: new Error('rpc returned no data') });
    const r = data as { created: number; already_existed: number; conflicts: number; limit_reached: boolean; through: string };
    return { created: r.created, alreadyExisted: r.already_existed, conflicts: r.conflicts, limitReached: r.limit_reached, through: r.through };
  },
};
