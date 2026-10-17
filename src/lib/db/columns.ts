/**
 * Copies only whitelisted keys (camelCase -> column) and skips `undefined`. Zod strict schemas already reject
 * unknown keys; this is the second guard at the write boundary, so `company_id`, `seats_booked`, `status`
 * or any other protected column can never reach an INSERT/UPDATE by accident.
 */
export function mapColumns(input: Record<string, unknown>, columns: Readonly<Record<string, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = input[key];
    if (value !== undefined) out[column] = value;
  }
  return out;
}
