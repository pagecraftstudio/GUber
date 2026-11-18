import type { SupabaseClient } from '@supabase/supabase-js';
import { reportOperationFailure } from '@/ui/lib/reportFailure';

/** Rows exactly as the 0014 RPCs return them. NOTHING here sends a company id or driver id: the database derives both from auth.uid(). */
export interface DriverTrip {
  trip_id: string; company_name: string; origin_name: string; destination_name: string;
  departure_at: string; arrival_at: string; status: string; expected: number; boarded: number; remaining: number;
}
export interface BoardingStats { expected: number; boarded: number; remaining: number }
/** Present when the ticket belongs to a route subscription (0037): the scan was also recorded for the day. */
export interface SubscriberInfo { direction: 'go' | 'return'; member_name: string; masar_id: string }
export interface BoardResult extends BoardingStats { result: 'boarded' | 'already_boarded'; ticket_index: number; boarded_at: string; subscriber?: SubscriberInfo }
/** MASAR ID fallback (scan_route_subscription): always a fresh boarding, never a replay. */
export interface MasarScanResult extends SubscriberInfo, BoardingStats { ticket_index: number }
export const MASAR_ID_RE = /^MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/i;

export type BoardErrorCode = 'not_signed_in' | 'trip_not_found' | 'invalid_ticket' | 'wrong_trip' | 'cancelled' | 'boarding_closed' | 'not_open' | 'subscription_invalid' | 'already_scanned' | 'no_subscription' | 'no_booking' | 'rate_limited' | 'network' | 'unknown';
export class BoardError extends Error {
  constructor(readonly code: BoardErrorCode) { super(code); this.name = 'BoardError'; }
}

export const BOARD_MESSAGES: Record<BoardErrorCode, string> = {
  not_signed_in: 'Your session has ended. Sign in again.',
  trip_not_found: 'This trip is not assigned to you.',
  invalid_ticket: 'Invalid ticket. Ask the passenger to reopen their ticket and try again.',
  wrong_trip: 'This ticket is for a different trip.',
  cancelled: 'This ticket has been cancelled.',
  boarding_closed: 'Boarding is closed for this trip.',
  subscription_invalid: 'This subscription is not active today. Ask the passenger to check with the company.',
  already_scanned: 'This subscriber already travelled in this direction today.',
  no_subscription: 'No active subscription found for this MASAR ID.',
  no_booking: 'This subscriber has no seat booked on this trip.',
  not_open: 'Boarding has not opened yet for this trip.',
  rate_limited: 'Scanning too fast. Wait a few seconds, then continue.',
  network: 'No connection. Check your signal, then try again. This scan was not recorded.',
  unknown: 'Something went wrong. Try again.',
};

export function classifyBoardError(code: string | undefined, message: string): BoardErrorCode {
  const m = message.toLowerCase();
  // a request that never reached the server has no database code (fetch failed, offline, dropped signal)
  if (!code && /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(m)) return 'network';
  if (code === 'PT429') return 'rate_limited';
  if (code === '28000' || code === 'PGRST301' || (code === '42501' && (m.includes('permission') || m.includes('jwt')))) return 'not_signed_in';
  if (code === 'P0002') {
    if (m.includes('invalid ticket')) return 'invalid_ticket';
    if (m.includes('no valid subscription')) return 'no_subscription';
    if (m.includes('no booking')) return 'no_booking';
    return 'trip_not_found';
  }
  if (code === '23505' && m.includes('already scanned')) return 'already_scanned';
  if (code === '23514') {
    if (m.includes('subscription is not valid')) return 'subscription_invalid';
    if (m.includes('another trip')) return 'wrong_trip';
    if (m.includes('cancelled')) return 'cancelled';
    if (m.includes('not opened')) return 'not_open';
    if (m.includes('closed')) return 'boarding_closed';
  }
  return 'unknown';
}

async function call<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = (await client.rpc(fn, args)) as { data: T | null; error: { code?: string; message: string } | null };
  if (error) {
    if (fn === 'board_ticket' || fn === 'scan_route_subscription') {
      // trip id only; the scanned token is never reported
      const tripId = typeof args?.p_trip_id === 'string' ? args.p_trip_id : undefined;
      reportOperationFailure('ticket.board', { pgCode: error.code }, tripId ? { tripId } : {});
    }
    throw new BoardError(classifyBoardError(error.code, error.message));
  }
  return data as T;
}

export function createDriverApi(client: SupabaseClient) {
  return {
    myTrips: () => call<DriverTrip[]>(client, 'driver_my_trips'),
    stats: (tripId: string) => call<BoardingStats>(client, 'driver_trip_boarding', { p_trip_id: tripId }),
    board: (tripId: string, token: string) => call<BoardResult>(client, 'board_ticket', { p_trip_id: tripId, p_token: token }),
    scanMasar: (tripId: string, masarId: string) => call<MasarScanResult>(client, 'scan_route_subscription', { p_masar_id: masarId, p_trip_id: tripId }),
  };
}
export type DriverApi = ReturnType<typeof createDriverApi>;
