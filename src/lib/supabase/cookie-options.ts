/**
 * @supabase/ssr defaults (path=/, sameSite=lax, maxAge 400d, httpOnly=false) do not set `Secure`. httpOnly must stay false
 * because the browser client reads the session cookie; but on an https site the cookie must never travel over http, so
 * `Secure` is added whenever NEXT_PUBLIC_SITE_URL is https. On http://localhost nothing changes (browsers drop Secure cookies
 * set over plain http in some engines, which would break local development).
 */
export const siteIsHttps = (siteUrl: string): boolean => /^https:\/\//i.test(siteUrl.trim());

export function withSecure<T extends object>(options: T | undefined, siteUrl: string): T & { secure?: boolean } {
  const base = (options ?? {}) as T;
  return siteIsHttps(siteUrl) ? { ...base, secure: true } : base;
}
