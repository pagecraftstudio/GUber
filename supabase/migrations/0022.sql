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
