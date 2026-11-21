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
/** Result of the driver's confirmation (confirm_boarding, 0052). Same shape board_ticket always returned. */
export interface ConfirmResult extends BoardingStats { result: 'boarded' | 'already_boarded'; ticket_index: number; boarded_at: string; subscriber?: SubscriberInfo }

/** The one answer to ANY scan (scan_identity, 0052): signed MASAR QR, typed MASAR ID or ticket QR. Read only: scanning never boards. */
export type ScanVerdict = 'ok_not_yet_boarded' | 'ok_boarded' | 'already_scanned' | 'no_booking' | 'no_subscription' | 'expired' | 'wrong_trip' | 'cancelled' | 'not_confirmed' | 'qr_expired';
export interface ScanCard {
  verdict: ScanVerdict;
  can_board: boolean;
  kind: 'ticket' | 'qr' | 'masar_id';
  /** false for a typed MASAR ID: anyone can type one, so the driver is told to ask for a photo ID. */
  verified: boolean;
  /** name is null for someone with no tie to this company: the driver learns only the MASAR ID. */
  student: { name: string | null; masar_id: string } | null;
  subscription: { state: 'valid' | 'expired'; plan_name?: string; valid_from?: string; valid_to?: string; days_left?: number; direction?: 'go' | 'return'; go_used?: boolean; return_used?: boolean } | null;
  /** The only cross-company fact: a yes/no. Never which company, plan or dates. */
  has_other_company_subscription: boolean;
  booking: { reference: string; seats: number; seats_boarded: number; status: string; payment_status: string; ticket_id: string | null; boarded: boolean; is_subscriber_booking: boolean } | null;
}
export const MASAR_ID_RE = /^MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/i;

export type BoardErrorCode = 'not_signed_in' | 'invalid_code' | 'trip_not_found' | 'invalid_ticket' | 'wrong_trip' | 'cancelled' | 'boarding_closed' | 'not_open' | 'subscription_invalid' | 'already_scanned' | 'no_subscription' | 'no_booking' | 'rate_limited' | 'network' | 'unknown';
export class BoardError extends Error {
  constructor(readonly code: BoardErrorCode) { super(code); this.name = 'BoardError'; }
}

export const BOARD_MESSAGES: Record<BoardErrorCode, string> = {
  not_signed_in: 'Your session has ended. Sign in again.',
  trip_not_found: 'This trip is not assigned to you.',
  invalid_code: 'Code not recognised. Ask the passenger to reopen their QR or ticket, then scan again.',
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
    if (m.includes('invalid code')) return 'invalid_code';
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
    if (fn === 'board_ticket' || fn === 'scan_route_subscription' || fn === 'scan_identity' || fn === 'confirm_boarding') {
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
    /** One question for every kind of code. Answers; never boards. */
    scanIdentity: (tripId: string, code: string) => call<ScanCard>(client, 'scan_identity', { p_code: code, p_trip_id: tripId }),
    /** The driver pressed "Board now". The server re-checks every rule; the card is only what the driver saw. */
    confirmBoarding: (tripId: string, ticketId: string) => call<ConfirmResult>(client, 'confirm_boarding', { p_trip_id: tripId, p_ticket_id: ticketId }),
  };
}
export type DriverApi = ReturnType<typeof createDriverApi>;
