-- UNREVIEWED / NOT APPLIED BY THE RUNNER. Found as supabase/migrations/0022.sql (no name, no rollback note).
-- It makes app_private.is_trip_public() require a live subscription. That CONTRADICTS the documented design in
-- 0021_public_listing_requires_live_subscription.sql ("is_trip_public() is NOT touched"; the booking path refuses via entitlement checks).
-- Moved out of supabase/migrations/ in Phase 1 so it is not applied silently. OWNER DECISION NEEDED:
--   * If it was already applied to a live/staging DB, that DB has drifted from the repo: compare pg_get_functiondef and decide.
--   * If wanted: rename to the next free number, add tests in supabase/tests/17_lifecycle_policy_tests.sql, re-run all suites.
-- ROLLBACK: re-run the `create or replace function app_private.is_trip_public` statement from 0013_customer_booking_web.sql.

CREATE OR REPLACE FUNCTION app_private.is_trip_public(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.company_settings s ON s.company_id = t.company_id
    JOIN public.website_settings w ON w.company_id = t.company_id
    WHERE t.id = p_trip_id
      AND t.status = 'scheduled'
      AND t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
      AND s.booking_enabled
      AND w.is_published
      AND app_private.is_company_active(t.company_id)
      AND app_private.has_live_subscription(t.company_id)
  )
$function$;
