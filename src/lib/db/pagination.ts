import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/** Offset pagination. Always bounded: no query may ask for an unbounded result set. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
});
export type PageParams = z.output<typeof pageQuerySchema>;

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; hasMore: boolean };

export function rangeFor({ page, pageSize }: PageParams): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function toPage<T>(items: T[], total: number | null | undefined, params: PageParams): Page<T> {
  const count = total ?? items.length;
  return { items, page: params.page, pageSize: params.pageSize, total: count, hasMore: params.page * params.pageSize < count };
}
