import { AppError } from '@/lib/errors';
import { mapDbError, type DbErrorLike } from './map-error';
import { toPage, type Page, type PageParams } from './pagination';

/** Structural subset of a supabase-js response, so repositories stay easy to fake in unit tests. */
export type DbResponse<D> = { data: D | null; error: DbErrorLike | null; count?: number | null };

export function expectPage<Row, T>(res: DbResponse<Row[]>, map: (row: Row) => T, params: PageParams): Page<T> {
  if (res.error) throw mapDbError(res.error);
  return toPage((res.data ?? []).map(map), res.count, params);
}

export function expectList<Row, T>(res: DbResponse<Row[]>, map: (row: Row) => T): T[] {
  if (res.error) throw mapDbError(res.error);
  return (res.data ?? []).map(map);
}

/** Zero rows is a normal outcome (missing row, or RLS hid it): the caller decides if that is `not_found`. */
export function expectMaybe<Row, T>(res: DbResponse<Row>, map: (row: Row) => T): T | null {
  if (res.error) throw mapDbError(res.error);
  return res.data == null ? null : map(res.data);
}

/** For INSERT ... RETURNING where a row must come back. */
export function expectOne<Row, T>(res: DbResponse<Row>, map: (row: Row) => T): T {
  const row = expectMaybe(res, map);
  if (row === null) throw new AppError('internal', { cause: new Error('insert returned no row') });
  return row;
}

/** Same as expectMaybe but turns "no row" into not_found (update/delete targets). */
export function expectFound<Row, T>(res: DbResponse<Row>, map: (row: Row) => T): T {
  const row = expectMaybe(res, map);
  if (row === null) throw new AppError('not_found');
  return row;
}

/**
 * supabase-js has no generated `Database` types in this repo yet, so it types every embedded relation as an
 * array. PostgREST actually returns an object for many-to-one embeds (trip.route, booking.customer). These two
 * casts state the real shape in ONE place; the integration tests assert it against a live PostgREST.
 * Replace with generated types once the project is linked to a Supabase instance.
 */
export const asRows = <Row>(res: unknown): DbResponse<Row[]> => res as DbResponse<Row[]>;
export const asRow = <Row>(res: unknown): DbResponse<Row> => res as DbResponse<Row>;
