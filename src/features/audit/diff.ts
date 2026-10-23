/**
 * Turns an audit `metadata` object ({ before, after, ...extra }) into rows a human can read. Pure: no I/O, and it
 * only ever returns strings, so the page can render values as text (React escapes them) and never as markup.
 */
export type DiffRow = { key: string; before: string | null; after: string | null; changed: boolean };
export type MetadataView = { rows: DiffRow[]; extra: { key: string; value: string }[] };

const MAX = 400;
export function show(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function buildMetadataView(metadata: Record<string, unknown> | null): MetadataView {
  if (!metadata) return { rows: [], extra: [] };
  const before = isObject(metadata.before) ? metadata.before : null;
  const after = isObject(metadata.after) ? metadata.after : null;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const rows: DiffRow[] = keys.map((key) => {
    const b = before && key in before ? before[key] : undefined;
    const a = after && key in after ? after[key] : undefined;
    return { key, before: before ? show(b) : null, after: after ? show(a) : null, changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
  const extra = Object.keys(metadata)
    .filter((k) => k !== 'before' && k !== 'after')
    .sort()
    .map((key) => ({ key, value: show(metadata[key]) }));
  return { rows, extra };
}
