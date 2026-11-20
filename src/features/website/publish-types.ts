export type PublicationRow = { version: number; is_current: boolean; note: string | null; published_at: string };
export const PUBLICATION_SELECT = 'version, is_current, note, published_at'; // never the snapshot: it is large and the list does not need it
export type PublicationVersion = { version: number; isCurrent: boolean; note: string | null; publishedAt: string };
export const toPublicationVersion = (r: PublicationRow): PublicationVersion => ({ version: r.version, isCurrent: r.is_current, note: r.note, publishedAt: r.published_at });
export const VERSION_HISTORY_LIMIT = 20;

export type PublishState = { isPublished: boolean; versions: PublicationVersion[] };
