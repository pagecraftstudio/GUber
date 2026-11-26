import { createHmac } from 'node:crypto';

/** Token lifetime: the database refuses an expiry more than 120 s ahead; 60 s covers one round trip. */
export const INGEST_TTL_SECONDS = 60;
export const MIN_INGEST_SECRET_LENGTH = 32;

export type IngestCall = 'events' | 'search' | 'consent:true' | 'consent:false';
export type IngestToken = { exp: number; sig: string };

/**
 * Signs 'v1|<call>|<session>|<user>|<company>|<exp>' (HMAC-SHA256, hex), the same string app_private.analytics_check_token recomputes (0071).
 * Server only: the secret never reaches the browser. Empty string stands for null user/company.
 */
export function signIngest(
  secret: string,
  call: IngestCall,
  b: { session: string; userId: string | null; companyId?: string | null },
  nowMs: number = Date.now(),
): IngestToken {
  if (secret.length < MIN_INGEST_SECRET_LENGTH) throw new Error('analytics ingest secret too short');
  const exp = Math.floor(nowMs / 1000) + INGEST_TTL_SECONDS;
  const sig = createHmac('sha256', secret).update(`v1|${call}|${b.session}|${b.userId ?? ''}|${b.companyId ?? ''}|${exp}`, 'utf8').digest('hex');
  return { exp, sig };
}
