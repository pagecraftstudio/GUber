import type { MarketplaceSearchParams } from '@/ui/types';

export interface SearchEventInput {
  origin?: string;
  destination?: string;
  travelDate?: string;
  filters?: Record<string, string | number | boolean>;
  resultsCount: number;
}

/**
 * The analytics payload for one explicit marketplace search (the person pressed Search or a quick date).
 * Origin and destination are the canonical place names behind the dropdown choices, never free text, so the demand report groups cleanly in any UI language.
 * Filters are a small snapshot of the current refinements; only non-default ones are included.
 */
export function buildSearchEvent(
  sent: { originId?: string; destId?: string; date?: string },
  params: Pick<MarketplaceSearchParams, 'sortBy' | 'timeOfDay' | 'maxPrice' | 'minAvailableSeats' | 'companyId'>,
  resultsCount: number,
  nameOf: (locationId: string | undefined) => string | undefined,
): SearchEventInput {
  const filters: Record<string, string | number | boolean> = {};
  if (params.sortBy && params.sortBy !== 'time_asc') filters.sort = params.sortBy;
  if (params.timeOfDay && params.timeOfDay !== 'all') filters.time_of_day = params.timeOfDay;
  if (params.maxPrice && params.maxPrice < 300) filters.max_price = params.maxPrice;
  if (params.minAvailableSeats && params.minAvailableSeats > 1) filters.min_seats = params.minAvailableSeats;
  if (params.companyId) filters.company = params.companyId;
  const origin = nameOf(sent.originId)?.trim().slice(0, 80) || undefined;
  const destination = nameOf(sent.destId)?.trim().slice(0, 80) || undefined;
  return {
    origin,
    destination,
    travelDate: sent.date && /^\d{4}-\d{2}-\d{2}$/.test(sent.date) ? sent.date : undefined,
    filters,
    resultsCount: Math.min(Math.max(0, Math.floor(resultsCount)), 10000),
  };
}
