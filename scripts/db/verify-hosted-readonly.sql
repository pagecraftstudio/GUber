-- READ-ONLY schema/ledger verification for a Supabase database that was migrated by hand (or by unknown means).
-- Run in the Supabase SQL editor (or psql) against the project you want to inspect. It changes NOTHING:
-- one read-only transaction, SELECT only, and it returns counts/names of schema objects, never row contents or customer data.
-- It cannot prove a migration ran completely or unmodified (the hosted DB has no file checksums unless the runner ledger exists);
-- it proves that each migration's signature objects exist. Missing = definitely not applied; present = probably applied.
begin read only;

-- 1. Ledger: does the runner's table exist, and what does it say?
select 'ledger_table' as check, coalesce(to_regclass('app_private.schema_ledger')::text, 'ABSENT (manual SQL never creates it)') as result;
select 'ledger_rows' as check, case when to_regclass('app_private.schema_ledger') is null then 'n/a'
  else (xpath('/row/c/text()', query_to_xml('select count(*) as c from app_private.schema_ledger', false, true, '')))[1]::text end as result;

-- 2. One signature object per migration (name check only; no row data)
with fn(mig, schema_name, proc) as (values
  ('0001','app_private','set_updated_at'), ('0004','app_private','forbid_company_id_change'),
  ('0006','app_private','current_company_ids'), ('0007','public','my_context'),
  ('0008','app_private','tenant_guard'), ('0009','app_private','normalize_phone'),
  ('0010','app_private','new_booking_reference'), ('0011','app_private','trips_status_machine'),
  ('0012','public','claim_my_customer'), ('0013','public','public_search_trips'), ('0013','public','create_my_booking'),
  ('0013b','app_private','my_booking_replay'), ('0014','public','my_ticket_qr'), ('0014','public','board_ticket'),
  ('0015','app_private','live_subscription'), ('0016','public','admin_platform_overview'),
  ('0017','public','admin_set_company_status'), ('0018','public','admin_set_subscription_status'),
  ('0019','public','admin_list_audit_logs'),
  ('0020','app_private','my_ticket_qr_impl'), ('0020','app_private','rate_limit_purge'),
  ('0021','app_private','has_live_subscription'))
select 'object' as check, mig || ' ' || schema_name || '.' || proc as item,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = fn.schema_name and p.proname = fn.proc)
       then 'present' else 'MISSING' end as result
from fn order by mig, item;
select 'object' as check, '0002/0003 table ' || t as item, case when to_regclass('public.' || t) is not null then 'present' else 'MISSING' end as result
from unnest(array['profiles','platform_users','roles','routes','trips','bookings','tickets','customers','subscriptions','audit_logs']) t;
select 'object' as check, '0020 table app_private.rate_limit_policies' as item, case when to_regclass('app_private.rate_limit_policies') is not null then 'present' else 'MISSING' end as result;

-- 3. Behavioural markers (function bodies, not data)
select 'marker' as check, '0021 public_search_trips filters on live subscription' as item,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'public_search_trips' and pg_get_functiondef(p.oid) ilike '%has_live_subscription%') then 'yes' else 'NO' end as result;
select 'marker' as check, '0020 public.my_ticket_qr is the limiter wrapper' as item,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'my_ticket_qr' and pg_get_functiondef(p.oid) ilike '%rate_limit%') then 'yes' else 'NO' end as result;
select 'marker' as check, '0013b create_my_booking uses idempotency replay' as item,
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'app_private') and p.proname like 'create_my_booking%' and pg_get_functiondef(p.oid) ilike '%my_booking_replay%') then 'yes' else 'NO' end as result;

-- 4. Security posture (counts only)
select 'security' as check, 'public tables without RLS (expect 0)' as item,
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as result;
select 'security' as check, 'anon EXECUTE on public functions (expect exactly: preview_invite, public_search_trips, public_trip_stops, resolve_tenant)' as item,
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), '(none)') as result;
select 'security' as check, 'app_private functions executable by anon (informational: compare with the local baseline in docs/STAGING-PREP-8C.md)' as item,
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app_private' and has_function_privilege('anon', p.oid, 'execute')), '(none)') as result;

-- 5. Environment marker and size indicators (counts only, no content)
select 'env' as check, 'app.environment database setting' as item,
  coalesce((select split_part(s, '=', 2) from pg_db_role_setting d, unnest(d.setconfig) s where d.setdatabase = (select oid from pg_database where datname = current_database()) and d.setrole = 0 and s like 'app.environment=%'), '(unset: treat as PRODUCTION)') as result;
select 'env' as check, 'row counts (customers, bookings, companies)' as item,
  (select count(*) from public.customers)::text || ', ' || (select count(*) from public.bookings)::text || ', ' || (select count(*) from public.companies)::text as result;
select 'env' as check, 'active super_admin count' as item, (select count(*)::text from public.platform_users where role = 'super_admin') as result;

rollback;
