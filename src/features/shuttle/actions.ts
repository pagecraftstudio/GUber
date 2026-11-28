'use server';
import { revalidatePath } from 'next/cache';
import { normalizeDigits } from '@/ds/format/normalize-digits';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { errorState, successState, type FormState } from '@/features/dashboard/form-state';
import { shuttleService } from './service';
import { SESSION_ACTIONS, type SessionActionName } from './schema';

/**
 * Server actions for the shuttle settings forms. No company id is read from the form: the context derives it from the session,
 * the service re-checks shuttle.config, and the database re-checks everything again (RPC + RLS).
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => (str(f, k) === '' ? NaN : Number(normalizeDigits(str(f, k))));
const flag = (f: FormData, k: string) => str(f, k) === '1';
const PATH = '/dashboard/shuttle/settings';
const OVERVIEW = '/dashboard/shuttle';

async function run(work: (c: TenantServiceContext) => Promise<void>, paths: string[] = [PATH]): Promise<FormState> {
  try {
    const c = createTenantServiceContext(await createClient(), (await requireTenant()));
    await work(c);
  } catch (e) {
    return errorState(e);
  }
  for (const p of paths) revalidatePath(p);
  return successState('saved');
}

export async function saveShuttleServiceFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run(async (c) => {
    await shuttleService.saveService(c, {
      routeId: str(f, 'routeId'), name: str(f, 'name'), outboundDirection: str(f, 'outboundDirection'),
      allowReverse: flag(f, 'allowReverse'), requestTtlMinutes: num(f, 'requestTtlMinutes'), allowWalkIn: flag(f, 'allowWalkIn'),
      maxSeatsPerRequest: num(f, 'maxSeatsPerRequest'), hubStopId: str(f, 'hubStopId') || null,
    });
  });
}

export async function setShuttleServiceActiveFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run(async (c) => {
    await shuttleService.setServiceActive(c, { serviceId: str(f, 'serviceId'), active: flag(f, 'active') });
  });
}

/** Fare cells are named `fare:<fromStopId>:<toStopId>`; an empty cell means "no fare" and is simply left out. */
export async function saveShuttleFaresFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run(async (c) => {
    const fares: { fromStopId: string; toStopId: string; price: number }[] = [];
    for (const [key, raw] of f.entries()) {
      const m = /^fare:([0-9a-fA-F-]{36}):([0-9a-fA-F-]{36})$/.exec(key);
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (!m || v === '') continue;
      fares.push({ fromStopId: m[1]!, toStopId: m[2]!, price: Number(normalizeDigits(v)) });
    }
    await shuttleService.saveFares(c, { serviceId: str(f, 'serviceId'), fares });
  });
}

/** The vehicle rows arrive as one JSON field built by the form; anything that is not the expected shape fails validation in the service. */
function vehiclesOf(f: FormData): unknown {
  try {
    return JSON.parse(str(f, 'vehicles'));
  } catch {
    return null;
  }
}

export async function startShuttleDayFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run(async (c) => {
    await shuttleService.startDay(c, { serviceId: str(f, 'serviceId'), serviceDate: str(f, 'serviceDate'), key: str(f, 'key'), vehicles: vehiclesOf(f) });
  }, [OVERVIEW]);
}

export async function cancelShuttleDayFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run(async (c) => {
    await shuttleService.cancelDay(c, { dayId: str(f, 'dayId'), reason: str(f, 'reason') });
  }, [OVERVIEW]);
}

/**
 * One entry point for every bus action (open loading, close loading, depart, arrive, out of service, return, end).
 * The form sends the state it SAW and a key; the database refuses a stale press and replays a double press. After ANY outcome the screen
 * is revalidated, so a stale press shows the real state straight away.
 */
export async function shuttleSessionActionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const action = str(f, 'action') as SessionActionName;
  if (!SESSION_ACTIONS.includes(action)) return errorState(new Error('invalid action'));
  const base = { sessionId: str(f, 'sessionId'), expectedState: str(f, 'expectedState'), key: str(f, 'key') };
  const minutesAgo = num(f, 'minutesAgo');
  const occurredAt = Number.isFinite(minutesAgo) && minutesAgo > 0 ? new Date(Date.now() - minutesAgo * 60_000).toISOString() : undefined;
  const reason = str(f, 'reason') || undefined;
  const result = await run(async (c) => {
    switch (action) {
      case 'open_loading': await shuttleService.openLoading(c, base); break;
      case 'close_loading': await shuttleService.closeLoading(c, base); break;
      case 'depart': await shuttleService.depart(c, base); break;
      case 'arrive': await shuttleService.arrive(c, { ...base, occurredAt, reason }); break;
      case 'out_of_service': await shuttleService.setOutOfService(c, { ...base, reason }); break;
      case 'return_to_service': await shuttleService.returnToService(c, base); break;
      case 'end_session': await shuttleService.endSession(c, base); break;
    }
  }, [OVERVIEW]);
  revalidatePath(OVERVIEW, 'layout'); // also after an error: a stale press must show the real state
  return result;
}
