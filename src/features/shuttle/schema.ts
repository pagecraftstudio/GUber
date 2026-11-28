import { z } from 'zod';
import { dateOnlySchema, idSchema, moneySchema, text } from '@/lib/validation/common';

// No company_id anywhere: the database derives the company from the route / service row (migration 0074).
// Limits mirror the CHECKs of shuttle_services and shuttle_fares.
export const serviceSaveSchema = z.strictObject({
  routeId: idSchema,
  name: text(1, 120),
  outboundDirection: z.enum(['forward', 'backward']),
  allowReverse: z.boolean(),
  requestTtlMinutes: z.number().int().min(1).max(240),
  allowWalkIn: z.boolean(),
  maxSeatsPerRequest: z.number().int().min(1).max(20),
  hubStopId: idSchema.nullable(),
});
export type ServiceSave = z.output<typeof serviceSaveSchema>;

export const serviceActiveSchema = z.strictObject({ serviceId: idSchema, active: z.boolean() });
export type ServiceActive = z.output<typeof serviceActiveSchema>;

export const faresSaveSchema = z
  .strictObject({
    serviceId: idSchema,
    fares: z.array(z.strictObject({ fromStopId: idSchema, toStopId: idSchema, price: moneySchema })).max(2000),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.fares.forEach((f, i) => {
      if (f.fromStopId === f.toStopId) ctx.addIssue({ code: 'custom', path: ['fares', i, 'toStopId'], message: 'same_stop' });
      const k = `${f.fromStopId}>${f.toStopId}`;
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['fares', i], message: 'duplicate_pair' });
      seen.add(k);
    });
  });
export type FaresSave = z.output<typeof faresSaveSchema>;

// ---- S2: operating day (migration 0075). The company still comes from the service/day row inside the database.
export const startDaySchema = z
  .strictObject({
    serviceId: idSchema,
    serviceDate: dateOnlySchema,
    key: text(1, 100),
    vehicles: z.array(z.strictObject({ busId: idSchema, driverId: idSchema, startStationIdx: z.number().int().min(0).max(199), direction: z.enum(['forward', 'backward']) })).min(1).max(50),
  })
  .superRefine((v, ctx) => {
    const buses = new Set<string>();
    const drivers = new Set<string>();
    v.vehicles.forEach((x, i) => {
      if (buses.has(x.busId)) ctx.addIssue({ code: 'custom', path: ['vehicles', i, 'busId'], message: 'duplicate_bus' });
      if (drivers.has(x.driverId)) ctx.addIssue({ code: 'custom', path: ['vehicles', i, 'driverId'], message: 'duplicate_driver' });
      buses.add(x.busId);
      drivers.add(x.driverId);
    });
  });
export type StartDay = z.output<typeof startDaySchema>;

export const cancelDaySchema = z.strictObject({ dayId: idSchema, reason: text(3, 300) });
export type CancelDay = z.output<typeof cancelDaySchema>;

export const overviewQuerySchema = z.strictObject({ serviceId: idSchema, date: dateOnlySchema.optional() });
export type OverviewQuery = z.output<typeof overviewQuerySchema>;

// ---- S3: leg engine (migration 0076). The expected state is what the screen last showed; the database refuses a stale press.
const sessionState = z.enum(['ready', 'loading', 'in_transit', 'arrived', 'completed', 'out_of_service']);
const actionBase = { sessionId: idSchema, expectedState: sessionState, key: text(1, 100) };
export const sessionActionSchema = z.strictObject(actionBase);
export type SessionAction = z.output<typeof sessionActionSchema>;
export const arriveSchema = z.strictObject({ ...actionBase, occurredAt: z.iso.datetime({ offset: true }).optional(), reason: text(3, 300).optional() });
export type ArriveInput = z.output<typeof arriveSchema>;
export const outOfServiceSchema = z.strictObject({ ...actionBase, reason: text(3, 300) });
export type OutOfServiceInput = z.output<typeof outOfServiceSchema>;
export const SESSION_ACTIONS = ['open_loading', 'close_loading', 'depart', 'arrive', 'out_of_service', 'return_to_service', 'end_session'] as const;
export type SessionActionName = (typeof SESSION_ACTIONS)[number];
