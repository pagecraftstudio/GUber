import 'server-only';
import { getEnv } from '@/lib/env';

/** Absolute invite URL on the staff app host (decision D5). The token is a credential: show it once, never log it. */
export function buildInviteUrl(token: string): string {
  return `${getEnv().NEXT_PUBLIC_SITE_URL}/invite/${encodeURIComponent(token)}`;
}
