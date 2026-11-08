import type { Trip } from './types';

/**
 * The ONE path a trip normally walks, one step per click:
 *   draft -> scheduled -> boarding -> in_progress (on the road) -> completed
 * The database state machine (migration 0011) is still the authority and refuses anything else; this only says
 * which step the single "next" button asks for. cancelled and completed have no next step.
 */
export type TripStatus = Trip['status'];

const NEXT: Partial<Record<TripStatus, TripStatus>> = { draft: 'scheduled', scheduled: 'boarding', boarding: 'in_progress', in_progress: 'completed' };

export const nextStatus = (s: TripStatus): TripStatus | null => NEXT[s] ?? null;
/** Cancelling is a separate action: possible until the trip is on the road. */
export const canCancel = (s: TripStatus): boolean => s === 'draft' || s === 'scheduled' || s === 'boarding';
/** Deleting is only for a draft (the database also refuses a draft that ever had a booking). */
export const canDelete = (s: TripStatus): boolean => s === 'draft';
