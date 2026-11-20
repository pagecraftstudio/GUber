import { z } from 'zod';

/** Note is free text shown only to staff; the database trims and caps at 500 too. HTML is not interpreted anywhere it is shown. */
export const publishInputSchema = z.strictObject({ note: z.string().trim().max(500).optional() });
export const rollbackInputSchema = z.strictObject({ version: z.number().int().min(1).max(1_000_000) });
