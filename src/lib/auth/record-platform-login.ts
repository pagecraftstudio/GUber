import 'server-only';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/log';
import { deviceFingerprint } from './device';

/**
 * New-device alert hook (0067). Called once after a successful sign-in of platform staff.
 * It must NEVER block or fail the sign-in: an alert is a signal, not a gate. A missing secret or a database error is logged (not hidden) and the sign-in goes on.
 */
export async function recordPlatformLogin(db: SupabaseClient): Promise<void> {
  try {
    const secret = process.env.PLATFORM_DEVICE_SECRET;
    if (!secret) { logger.error('platform.device_secret_missing'); return; }
    const h = await headers();
    const ip = h.get('x-forwarded-for') ?? h.get('x-real-ip');
    const { hash, label } = deviceFingerprint({ ip, userAgent: h.get('user-agent') }, secret);
    const { error } = await db.rpc('record_platform_login', { p_device_hash: hash, p_label: label });
    if (error) logger.error('platform.login_record_failed', { code: error.code });
  } catch (e) {
    logger.error('platform.login_record_failed', { reason: e instanceof Error ? e.message : 'unknown' });
  }
}
