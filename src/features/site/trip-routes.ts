/** Distinct origin -> destination pairs, in order of first departure. Pure (kept apart from the server-only data module so it is unit-testable). */
export function distinctRoutes<T extends { origin_name: string; destination_name: string }>(trips: T[]): { origin: string; destination: string }[] {
  const seen = new Set<string>();
  const out: { origin: string; destination: string }[] = [];
  for (const t of trips) {
    const key = `${t.origin_name}\u0000${t.destination_name}`;
    if (!seen.has(key)) { seen.add(key); out.push({ origin: t.origin_name, destination: t.destination_name }); }
  }
  return out;
}
