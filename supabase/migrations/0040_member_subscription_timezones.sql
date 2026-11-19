-- 0040: member screens show trip times in the COMPANY time zone, not the browser's.
-- Members cannot read company_settings, so this returns only the time zone of the companies where the caller has a subscription.
-- Caller comes from auth.uid(); nothing else is exposed. ROLLBACK: drop function public.my_subscription_timezones().
-- RUNNER NOTE: apply BEFORE deploying the code that calls it. Requires 0034.
create function public.my_subscription_timezones()
returns table (subscription_id uuid, timezone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select s.id, coalesce(cs.timezone, 'Africa/Cairo')
    from public.route_subscriptions s
    left join public.company_settings cs on cs.company_id = s.company_id
    where s.user_id = auth.uid();
end $$;
revoke all on function public.my_subscription_timezones() from public, anon;
grant execute on function public.my_subscription_timezones() to authenticated;
