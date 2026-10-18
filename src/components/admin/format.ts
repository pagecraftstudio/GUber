/** ISO instant -> "2030-01-31 14:05 UTC". Fixed zone and format, so server and client render identically. */
export const fmtDateTime = (iso: string): string => new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
export const fmtDate = (iso: string): string => new Date(iso).toISOString().slice(0, 10);
