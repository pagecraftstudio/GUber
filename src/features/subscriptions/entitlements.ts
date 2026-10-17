import type { Entitlements } from './types';

/**
 * Pure helpers for reading plan limits in the UI/services. The DATABASE enforces limits (triggers, 0004); these
 * only let screens show "3 of 5 buses" or hide a locked feature. Semantics match entitlement_limit():
 * a key the plan does not mention is NOT granted (limit 0, flag off); a null limit means unlimited.
 */
export type Limit = { unlimited: true } | { unlimited: false; max: number };

export function limitFor(entitlements: Entitlements, key: string): Limit {
  const e = entitlements[key];
  if (!e || e.kind !== 'limit') return { unlimited: false, max: 0 };
  return e.limit === null ? { unlimited: true } : { unlimited: false, max: e.limit };
}

export function isFeatureEnabled(entitlements: Entitlements, key: string): boolean {
  const e = entitlements[key];
  return e?.kind === 'flag' ? e.enabled : false;
}

export function isWithinLimit(entitlements: Entitlements, key: string, currentCount: number): boolean {
  const l = limitFor(entitlements, key);
  return l.unlimited || currentCount < l.max;
}
