-- 0031: let company staff read their company's time zone.
--
-- PROBLEM: forms send local date-times ("2026-12-01T08:00"). Interpreting them needs the COMPANY time zone
--   (company_settings.timezone), but company_settings is readable only with settings.read, which not every role that
--   has trips.write also has. The app then guessed a zone (server time = UTC on Vercel), so 08:00 was stored as 08:00 UTC.
-- CHANGE: company_timezone(company) returns ONE column, the IANA zone name, to any ACTIVE member of that company (every screen that
--   shows a trip time needs it, whatever the role).
--   Other companies answer "not found" (same as every other function: no existence leak). Nothing else of company_settings is exposed.
-- ROLLBACK: drop function public.company_timezone(uuid);
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh (staging first). Immutable once applied.
set search_path = public, extensions;

create function public.company_timezone(p_company_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_tz text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_company_id is null or p_company_id not in (select app_private.current_company_ids()) then
    raise exception 'company not found' using errcode = 'P0002'; end if;
  select s.timezone into v_tz from public.company_settings s where s.company_id = p_company_id;
  return coalesce(v_tz, 'UTC');
end $$;
revoke all on function public.company_timezone(uuid) from public, anon;
grant execute on function public.company_timezone(uuid) to authenticated;
