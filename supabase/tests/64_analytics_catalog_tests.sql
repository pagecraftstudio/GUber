-- 64: P10 slice B, analytics event catalogue v2 (migration 0069). Harness style. Every active catalogue event must be accepted with exactly its allowed keys, refuse an extra key, and look non-personal.
select t.as_admin();
delete from t.results where name like 'p10b: %';
select public.record_consent('sess_test_catalog_0001', null, true, '1');

do $$
declare c record; k text; props jsonb; n int; bad text;
begin
  for c in select * from public.analytics_event_catalog where is_active order by event loop
    perform t.eq(format('p10b: %s name does not look personal', c.event), c.event !~* '(email|phone|name|passw|token|address|masar|student|(^|[._])ip([._]|$))', true);
    bad := null;
    foreach k in array c.allowed_keys loop
      if k ~* '(email|phone|name|passw|token|address|masar|student|(^|_)ip(_|$)|text|note|message|query)' then bad := k; end if;
    end loop;
    perform t.eq(format('p10b: %s has no personal or free-text key', c.event), bad is null, true);

    props := coalesce((select jsonb_object_agg(k2, 'x') from unnest(c.allowed_keys) k2), '{}'::jsonb);
    n := public.track_events('sess_test_catalog_0001', null, null, jsonb_build_array(jsonb_build_object('event', c.event, 'properties', props)), '{"path":"/t"}');
    perform t.eq(format('p10b: %s is accepted with its keys', c.event), n::bigint, 1::bigint);
    perform t.eq(format('p10b: %s is stored on the right surface', c.event), (select count(*) from public.analytics_events where session_id = 'sess_test_catalog_0001' and event = c.event and surface = c.surface), 1::bigint);

    begin
      perform public.track_events('sess_test_catalog_0001', null, null, jsonb_build_array(jsonb_build_object('event', c.event, 'properties', props || '{"zz_extra":"1"}')), '{"path":"/t"}');
      perform t.eq(format('p10b: %s refuses an extra key', c.event), true, false);
    exception when others then
      perform t.eq(format('p10b: %s refuses an extra key', c.event), sqlstate, '22023');
    end;
  end loop;
end $$;

select t.eq('p10b: the v2 events are present (a skipped migration fails here)', (select count(*) from public.analytics_event_catalog where event in ('booking_step', 'scan_outcome', 'result_click', 'cta_click', 'feature_use')), 5::bigint);

delete from public.analytics_events where session_id like 'sess_test_catalog_%';
delete from public.consents where session_id like 'sess_test_catalog_%';
