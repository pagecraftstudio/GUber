-- 18 (PROPOSAL): tests for 0022. Requires 01..17 and 0022 on the same throw-away DB; see docs/STAGING-PREP-8C.md.
select t.as_anon();
select t.eq('18: public_search_trips caps the offset in its definition',
  (select pg_get_functiondef(p.oid) ilike '%least(greatest(coalesce(p_offset, 0), 0), 1000)%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'public_search_trips'), true);
select t.eq('18: absurd offset does not error and equals the capped offset',
  (select count(*) from public.public_search_trips(p_offset => 2147483647)), (select count(*) from public.public_search_trips(p_offset => 1000)));
select t.eq('18: negative offset behaves as 0',
  (select count(*) from public.public_search_trips(p_offset => -5)), (select count(*) from public.public_search_trips(p_offset => 0)));
select t.eq('18: limit still clamped to 100', (select count(*) <= 100 from public.public_search_trips(p_limit => 100000)), true);
select t.eq('18: anon still has EXECUTE (decision B unchanged)', has_function_privilege('anon', 'public.public_search_trips(text,text,date,uuid,integer,integer)', 'execute'), true);
