/**
 * Server-side allow-list for the MASAR visual scope (plan 5.3). Read at request time, so a change is an
 * environment-variable edit plus a redeploy-free toggle on platforms that support runtime env, with instant rollback.
 *
 *   DS_SURFACES          comma list of surfaces to flip for everyone: marketplace,public,dashboard,admin,driver,auth,system
 *                        ("all" flips every surface)
 *   DS_PILOT_COMPANIES   comma list of company UUIDs. A tenant-bound surface (public, dashboard) is flipped for
 *                        these companies even when its surface is not in DS_SURFACES.
 *
 * Default (both unset) = nothing flipped = every surface renders exactly as before.
 * This only chooses styling. It grants no access and is never an authorization input.
 */
export const DS_SURFACE_NAMES = ['marketplace', 'public', 'dashboard', 'admin', 'driver', 'auth', 'system'] as const;
export type DsSurface = (typeof DS_SURFACE_NAMES)[number];

/** Surfaces that belong to one company and so can be piloted per company. */
const TENANT_SURFACES: readonly DsSurface[] = ['public', 'dashboard'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export interface DsEnv {
  DS_SURFACES?: string;
  DS_PILOT_COMPANIES?: string;
}

export function isSurfaceScoped(surface: DsSurface, companyId: string | null | undefined, env: DsEnv = process.env as DsEnv): boolean {
  const surfaces = list(env.DS_SURFACES);
  if (surfaces.includes('all') || surfaces.includes(surface)) return true;
  if (companyId && TENANT_SURFACES.includes(surface) && UUID.test(companyId)) {
    return list(env.DS_PILOT_COMPANIES).filter((id) => UUID.test(id)).includes(companyId.toLowerCase());
  }
  return false;
}
