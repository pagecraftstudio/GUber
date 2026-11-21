const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The plan id from `?plan=`, or null when it is missing or not a UUID (so it can be put back into a return address safely). */
export const planFocus = (raw: string | undefined): string | null => (raw && UUID.test(raw) ? raw.toLowerCase() : null);
