-- 13: Phase 7.3 company management RPCs (0017). Requires 01 fixtures. Run after 11 and 12.
-- State: fixture companies A/B/C are restored. The company this suite creates is soft-deleted at the end (audit rows are
-- append-only and reference it, so it cannot be hard-deleted). Test notes are removed. Audit rows stay by design.

-- ---------- helpers (create or replace: identical copies exist in 11/12 where shared) ----------
create or replace function t.as_trusted(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); end $$;
create or replace function t.raises_msg(name text, stmt text, state text, frag text) returns void language plpgsql as
  $$ begin
       execute stmt;
       insert into t.results(ok,name,detail) values (false,name,'no error'); raise notice 'FAIL  % (no error)', name;
     exception when others then
       if sqlstate = state and sqlerrm like '%' || frag || '%' then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s: %s',sqlstate,sqlerrm)); raise notice 'FAIL  % (sqlstate %: %)', name, sqlstate, sqlerrm; end if;
     end $$;
-- run one check as a given identity (null = anon), then go back to the superuser session
create or replace function t.raises_as(name text, who uuid, stmt text, state text) returns void language plpgsql as
  $$ begin
       if who is null then perform t.as_anon(); else perform t.as_user(who); end if;
       perform t.raises(name, stmt, state);
       perform t.as_admin();
     end $$;
create or replace function t.passes_as(name text, who uuid, stmt text) returns void language plpgsql as
  $$ begin
       perform t.as_user(who);
       perform t.passes(name, stmt);
       perform t.as_admin();
     end $$;
create or replace function t.audits(p_action text, p_company uuid) returns bigint language sql as
  $$ select count(*) from public.audit_logs where action = p_action and company_id = p_company $$;
create or replace function t.world() returns text language sql as $$
  select concat_ws('|', (select count(*) from public.companies), (select count(*) from public.subscriptions),
                        (select count(*) from public.company_invites), (select count(*) from public.company_notes),
                        (select count(*) from public.audit_logs)) $$;

-- ======================= A. WHO MAY CALL WHAT =======================
-- reads: every platform role; writes: super_admin only (notes: super_admin + support)
select t.passes_as('A: super_admin may list', t.u(1), 'select public.admin_list_companies()');
select t.passes_as('A: support may list', t.u(9), 'select public.admin_list_companies()');
select t.passes_as('A: billing may list', t.u(10), 'select public.admin_list_companies()');
select t.passes_as('A: super_admin may read detail', t.u(1), format('select public.admin_company_detail(%L)', t.u(101)));
select t.passes_as('A: support may read detail', t.u(9), format('select public.admin_company_detail(%L)', t.u(101)));
select t.passes_as('A: billing may read detail', t.u(10), format('select public.admin_company_detail(%L)', t.u(101)));

create temp table t13_nobody (who uuid, label text);
insert into t13_nobody values (t.u(2),'owner A'),(t.u(3),'manager A'),(t.u(6),'driver A'),(t.u(7),'owner B'),
  ('99999999-9999-4999-8999-999999999999','user without profile'),(null,'anon');
select t.raises_as('A: ' || label || ' cannot list', who, 'select public.admin_list_companies()', '42501') from t13_nobody;
select t.raises_as('A: ' || label || ' cannot read detail', who, format('select public.admin_company_detail(%L)', t.u(101)), '42501') from t13_nobody;

create temp table t13_nowrite (who uuid, label text);
insert into t13_nowrite select * from t13_nobody;
insert into t13_nowrite values (t.u(9),'support'),(t.u(10),'billing');
select t.raises_as('A: ' || label || ' cannot create company', who,
  $q$select public.admin_create_company('Nope','phase73-nope',null,null,null,null,null,'starter',null,'nope@test.dev')$q$, '42501') from t13_nowrite;
select t.raises_as('A: ' || label || ' cannot update company', who,
  format($q$select public.admin_update_company(%L, '{"name":"Hacked"}')$q$, t.u(101)), '42501') from t13_nowrite;
select t.raises_as('A: ' || label || ' cannot change status', who,
  format($q$select public.admin_set_company_status(%L, 'suspended', 'should not work')$q$, t.u(101)), '42501') from t13_nowrite;
select t.raises_as('A: ' || label || ' cannot add note', who,
  format($q$select public.admin_add_note(%L, 'phase73: nope')$q$, t.u(101)), '42501')
  from t13_nowrite where label <> 'support';
select t.eq('A: refused calls changed nothing (A still active, same name)',
  (select status || '|' || name from companies where id = t.u(101)), 'active|Company A');

-- ======================= B. FUNCTION HARDENING =======================
create temp table t13_fn (sig text);
insert into t13_fn values ('public.admin_list_companies(text,text,text,text,integer,integer)'),('public.admin_company_detail(uuid)'),
  ('public.admin_create_company(text,text,text,text,text,text,text,text,integer,text)'),
  ('public.admin_update_company(uuid,jsonb)'),('public.admin_set_company_status(uuid,text,text)'),('public.admin_add_note(uuid,text)');
select t.eq('B: ' || sig || ' is security definer with empty search_path',
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = sig::regprocedure), true) from t13_fn;
select t.eq('B: ' || sig || ' anon has no EXECUTE', has_function_privilege('anon', sig, 'execute'), false) from t13_fn;
select t.eq('B: ' || sig || ' authenticated has EXECUTE', has_function_privilege('authenticated', sig, 'execute'), true) from t13_fn;
select t.eq('B: no admin function takes a role, actor or user parameter',
  (select count(*) from pg_proc p, unnest(coalesce(p.proargnames, '{}'::text[])) a
    where p.oid in (select sig::regprocedure from t13_fn) and (a ~* 'role|actor|user')), 0::bigint);

-- ======================= C. LIST =======================
select t.as_user(t.u(1));
select t.eq('C: total equals the live company count',
  (public.admin_list_companies()->>'total')::bigint, (select count(*) from companies where deleted_at is null));
select t.eq('C: status filter total matches the table (suspended)',
  (public.admin_list_companies(null,'suspended')->>'total')::bigint, (select count(*) from companies where deleted_at is null and status = 'suspended'));
select t.eq('C: search by slug finds company A exactly once',
  (select count(*) from jsonb_array_elements(public.admin_list_companies('company-a')->'items') e where e->>'slug' = 'company-a'), 1::bigint);
select t.eq('C: search is case-insensitive', (select count(*) from jsonb_array_elements(public.admin_list_companies('COMPANY-A')->'items') e where e->>'slug' = 'company-a'), 1::bigint);
select t.eq('C: LIKE wildcard % is escaped (matches nothing)', (public.admin_list_companies('%')->>'total')::bigint, 0::bigint);
select t.eq('C: LIKE wildcard _ is escaped (matches nothing)', (public.admin_list_companies('_')->>'total')::bigint, 0::bigint);
select t.eq('C: A row carries its live plan',
  (select e->>'plan_code' from jsonb_array_elements(public.admin_list_companies('company-a')->'items') e where e->>'slug' = 'company-a'), 'professional');
select t.eq('C: suspended company C is listed with status suspended',
  (select e->>'status' from jsonb_array_elements(public.admin_list_companies('company-c')->'items') e where e->>'slug' = 'company-c'), 'suspended');
select t.eq('C: page_size 1 returns one item', jsonb_array_length(public.admin_list_companies(null,null,'created_at','desc',1,1)->'items'), 1);
select t.eq('C: page 2 is a different row than page 1',
  public.admin_list_companies(null,null,'name','asc',1,1)->'items'->0->>'id' is distinct from public.admin_list_companies(null,null,'name','asc',2,1)->'items'->0->>'id', true);
select t.eq('C: items carry no suspension reason', (public.admin_list_companies('company-c')::text like '%secret internal reason%'), false);
select t.raises('C: bad status filter -> 22023', $$select public.admin_list_companies(null,'bogus')$$, '22023');
select t.raises('C: injection in sort -> 22023', $$select public.admin_list_companies(null,null,'name; drop table companies','asc')$$, '22023');
select t.raises('C: bad direction -> 22023', $$select public.admin_list_companies(null,null,'name','sideways')$$, '22023');
select t.raises('C: page 0 -> 22023', $$select public.admin_list_companies(null,null,'name','asc',0,25)$$, '22023');
select t.raises('C: page_size 101 -> 22023 (always bounded)', $$select public.admin_list_companies(null,null,'name','asc',1,101)$$, '22023');
select t.as_admin();

-- ======================= D. DETAIL =======================
select t.as_user(t.u(1));
create temp table t13_da as select public.admin_company_detail(t.u(101)) as j;
create temp table t13_dc as select public.admin_company_detail(t.u(103)) as j;
grant select on t13_da, t13_dc to authenticated;
select t.as_admin();
select t.eq('D: A name', (select j->'company'->>'name' from t13_da), 'Company A');
select t.eq('D: A live subscription is professional', (select j->'subscription'->>'plan_code' || '|' || (j->'subscription'->>'is_live') from t13_da), 'professional|true');
select t.eq('D: A user count matches company_users', (select (j->'counts'->>'users')::bigint from t13_da),
  (select count(*) from company_users where company_id = t.u(101) and status = 'active'));
select t.eq('D: A trip count matches trips', (select (j->'counts'->>'trips')::bigint from t13_da), (select count(*) from trips where company_id = t.u(101)));
select t.eq('D: A booking count matches bookings', (select (j->'counts'->>'bookings')::bigint from t13_da), (select count(*) from bookings where company_id = t.u(101)));
select t.eq('D: A has exactly one owner listed', (select jsonb_array_length(j->'owners') from t13_da), 1);
select t.eq('D: A owner is user 2', (select j->'owners'->0->>'email' from t13_da), 'u2@test.dev');
select t.eq('D: internal note is returned to platform', (select count(*) from t13_da, jsonb_array_elements(j->'notes') n where n->>'body' = 'internal note A'), 1::bigint);
select t.eq('D: no token hash anywhere in the payload', (select j::text like '%token%' from t13_da), false);
select t.eq('D: platform sees the suspension reason of C', (select j->'company'->>'suspension_reason' from t13_dc), 'secret internal reason');
select t.eq('D: payload has exactly the documented top-level keys', (select array(select jsonb_object_keys(j) order by 1) from t13_da),
  array['company','counts','notes','owners','pending_invites','resume_status','settings','subscription']);
select t.as_user(t.u(1));
select t.raises('D: unknown company -> P0002', $$select public.admin_company_detail('00000000-0000-4000-8000-0000000fffff')$$, 'P0002');
select t.raises('D: null id -> P0002', $$select public.admin_company_detail(null)$$, 'P0002');
select t.as_admin();

-- ======================= E. CREATE =======================
create temp table t13_world0 as select t.world() as w;
select t.as_user(t.u(1));
create temp table t13_new as select public.admin_create_company(
  'Phase73 Co', 'Phase73-Co', 'Ali Contact', 'Contact@Phase73.test', '+201012345678', 'Phase73 LLC', 'eg', 'starter', null,
  'Phase73-Owner@Test.dev') as j;
grant select on t13_new to authenticated;
select t.as_admin();
create temp table t13_n as select (j->>'company_id')::uuid as id, j->>'token' as token, (j->>'invite_id')::uuid as invite_id from t13_new;
grant select on t13_n to authenticated;   -- later checks read the new id while acting as a platform user

select t.eq('E: company exists in status trial', (select status from companies where id = (select id from t13_n)), 'trial');
select t.eq('E: slug stored lower-case', (select slug::text from companies where id = (select id from t13_n)), 'phase73-co');
select t.eq('E: contact email lower-cased, country upper-cased, phone E.164',
  (select contact_email::text || '|' || country::text || '|' || contact_phone || '|' || contact_name || '|' || legal_name from companies where id = (select id from t13_n)),
  'contact@phase73.test|EG|+201012345678|Ali Contact|Phase73 LLC');
select t.eq('E: created_by is the acting super_admin', (select created_by from companies where id = (select id from t13_n)), t.u(1));
select t.eq('E: settings row created by the existing trigger', (select count(*) from company_settings where company_id = (select id from t13_n)), 1::bigint);
select t.eq('E: exactly one subscription, trialing, on the starter plan',
  (select count(*) || '|' || min(s.status) || '|' || min(p.code) from subscriptions s join plans p on p.id = s.plan_id where s.company_id = (select id from t13_n)), '1|trialing|starter');
select t.eq('E: trial length equals the plan trial_days',
  (select extract(day from s.current_period_end - s.current_period_start)::int from subscriptions s where s.company_id = (select id from t13_n)),
  (select trial_days from plans where code = 'starter'));
select t.eq('E: subscription is live (entitlement checks accept it)',
  (select count(*) from app_private.live_subscription((select id from t13_n))), 1::bigint);
select t.eq('E: one pending owner invite for the lower-cased email',
  (select count(*) from company_invites ci join roles r on r.id = ci.role_id
    where ci.company_id = (select id from t13_n) and ci.status = 'pending' and r.key = 'owner' and ci.email::text = 'phase73-owner@test.dev' and ci.invited_by = t.u(1)), 1::bigint);
select t.eq('E: token returned once and stored only as a hash',
  (select length(token) >= 60 and ci.token_hash <> token and ci.token_hash = app_private.hash_invite_token(token)
     from t13_n n join company_invites ci on ci.id = n.invite_id), true);
select t.eq('E: exactly one company.created audit row, by the platform user',
  (select count(*) from audit_logs where action = 'company.created' and company_id = (select id from t13_n) and actor_id = t.u(1) and actor_type = 'platform_user'), 1::bigint);
select t.eq('E: exactly one invite.created audit row', t.audits('invite.created', (select id from t13_n)), 1::bigint);
select t.eq('E: audit after-snapshot names plan and owner, no before', (select metadata->'after'->>'plan_code' || '|' || (metadata->'after'->>'owner_email') || '|' || coalesce(metadata->>'before', 'null')
   from audit_logs where action = 'company.created' and company_id = (select id from t13_n)), 'starter|phase73-owner@test.dev|null');
select t.eq('E: invite token never appears in any audit row of the company',
  (select count(*) from audit_logs a, t13_n n where a.company_id = n.id and a.metadata::text like '%' || n.token || '%'), 0::bigint);

-- failures: nothing partial, no audit row
create temp table t13_world1 as select t.world() as w;
select t.as_user(t.u(1));
select t.raises('E: duplicate slug -> 23505', $q$select public.admin_create_company('Dup','company-a',null,null,null,null,null,'starter',null,'dup1@test.dev')$q$, '23505');
select t.raises('E: duplicate slug differing only by case -> 23505', $q$select public.admin_create_company('Dup','COMPANY-A',null,null,null,null,null,'starter',null,'dup2@test.dev')$q$, '23505');
select t.raises_msg('E: reserved slug', $q$select public.admin_create_company('R','admin',null,null,null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'reserved slug');
select t.raises_msg('E: slug too short', $q$select public.admin_create_company('R','ab',null,null,null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'invalid slug');
select t.raises_msg('E: slug with underscore', $q$select public.admin_create_company('R','bad_slug',null,null,null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'invalid slug');
select t.raises_msg('E: slug starting with hyphen', $q$select public.admin_create_company('R','-bad-slug',null,null,null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'invalid slug');
select t.raises_msg('E: empty name', $q$select public.admin_create_company('   ','phase73-x1',null,null,null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'invalid company name');
select t.raises_msg('E: unknown plan', $q$select public.admin_create_company('R','phase73-x2',null,null,null,null,null,'nope',null,'r@test.dev')$q$, '22023', 'unknown plan');
select t.raises_msg('E: null plan', $q$select public.admin_create_company('R','phase73-x3',null,null,null,null,null,null,null,'r@test.dev')$q$, '22023', 'unknown plan');
select t.raises_msg('E: trial days 0', $q$select public.admin_create_company('R','phase73-x4',null,null,null,null,null,'starter',0,'r@test.dev')$q$, '22023', 'invalid trial days');
select t.raises_msg('E: trial days 366', $q$select public.admin_create_company('R','phase73-x5',null,null,null,null,null,'starter',366,'r@test.dev')$q$, '22023', 'invalid trial days');
select t.raises_msg('E: bad owner email', $q$select public.admin_create_company('R','phase73-x6',null,null,null,null,null,'starter',null,'not-an-email')$q$, '22023', 'invalid email');
select t.raises_msg('E: null owner email', $q$select public.admin_create_company('R','phase73-x7',null,null,null,null,null,'starter',null,null)$q$, '22023', 'invalid email');
select t.raises_msg('E: bad contact email', $q$select public.admin_create_company('R','phase73-x8',null,'nope',null,null,null,'starter',null,'r@test.dev')$q$, '22023', 'invalid contact email');
select t.raises_msg('E: bad country', $q$select public.admin_create_company('R','phase73-x9',null,null,null,null,'EGY','starter',null,'r@test.dev')$q$, '22023', 'invalid country');
select t.raises('E: bad phone -> 22023', $q$select public.admin_create_company('R','phase73-y1',null,null,'abc',null,null,'starter',null,'r@test.dev')$q$, '22023');
-- ATOMICITY: company + subscription already inserted when the owner check fails (u2@test.dev already belongs to company A)
select t.raises('E: owner who already belongs to a company -> 23505', $q$select public.admin_create_company('Atomic','phase73-atomic',null,null,null,null,null,'starter',null,'u2@test.dev')$q$, '23505');
select t.as_admin();
select t.eq('E: no company, subscription, invite, note or audit row left behind by any failure', t.world(), (select w from t13_world1));
select t.eq('E: the atomic-failure company does not exist', (select count(*) from companies where slug = 'phase73-atomic'), 0::bigint);

-- ======================= F. UPDATE =======================
select t.as_user(t.u(1));
select t.eq('F: rename reports changed', (public.admin_update_company((select id from t13_n), '{"name":"Phase73 Renamed"}'::jsonb)->>'changed')::boolean, true);
select t.as_admin();
select t.eq('F: name stored', (select name from companies where id = (select id from t13_n)), 'Phase73 Renamed');
select t.eq('F: exactly one company.updated row, only the changed field, with before and after',
  (select count(*) from audit_logs where action = 'company.updated' and company_id = (select id from t13_n)
     and metadata->'before' = '{"name":"Phase73 Co"}'::jsonb and metadata->'after' = '{"name":"Phase73 Renamed"}'::jsonb), 1::bigint);
select t.as_user(t.u(1));
select t.eq('F: same value again reports unchanged', (public.admin_update_company((select id from t13_n), '{"name":"Phase73 Renamed"}'::jsonb)->>'changed')::boolean, false);
select t.as_admin();
select t.eq('F: a no-op patch writes no audit row', t.audits('company.updated', (select id from t13_n)), 1::bigint);
select t.as_user(t.u(1));
select t.passes('F: multi-field patch', $q$select public.admin_update_company((select id from t13_n), '{"legal_name":"New LLC","contact_name":"Sara","tax_number":"123-456","country":"eg","contact_email":"New@Mail.TEST"}'::jsonb)$q$);
select t.as_admin();
select t.eq('F: normalised values stored',
  (select legal_name || '|' || contact_name || '|' || tax_number || '|' || country::text || '|' || contact_email::text from companies where id = (select id from t13_n)),
  'New LLC|Sara|123-456|EG|new@mail.test');
-- country 'eg' normalises to the 'EG' already stored, so it is NOT a change: four keys, not five
select t.eq('F: second audit row lists exactly the four changed keys with their old values',
  (select count(*) from audit_logs where action = 'company.updated' and company_id = (select id from t13_n)
     and (select count(*) from jsonb_object_keys(metadata->'after')) = 4
     and metadata->'before'->>'legal_name' = 'Phase73 LLC' and metadata->'before'->>'contact_name' = 'Ali Contact'
     and metadata->'before'->>'contact_email' = 'contact@phase73.test' and metadata->'before'->'tax_number' = 'null'::jsonb
     and not (metadata->'after' ? 'country')), 1::bigint);
select t.as_user(t.u(1));
select t.passes('F: empty string clears a nullable field', $q$select public.admin_update_company((select id from t13_n), '{"contact_name":""}'::jsonb)$q$);
select t.as_admin();
select t.eq('F: contact_name is now null', (select contact_name from companies where id = (select id from t13_n)), null::text);
select t.as_user(t.u(1));
select t.raises('F: slug is immutable (unknown field) -> 22023', format($q$select public.admin_update_company(%L, '{"slug":"phase73-other"}')$q$, (select id from t13_n)), '22023');
select t.raises('F: status cannot be set here -> 22023', format($q$select public.admin_update_company(%L, '{"status":"active"}')$q$, (select id from t13_n)), '22023');
select t.raises('F: suspended_at cannot be set here -> 22023', format($q$select public.admin_update_company(%L, '{"suspended_at":"2020-01-01"}')$q$, (select id from t13_n)), '22023');
select t.raises('F: empty patch -> 22023', format($q$select public.admin_update_company(%L, '{}')$q$, (select id from t13_n)), '22023');
select t.raises('F: non-object patch -> 22023', format($q$select public.admin_update_company(%L, '[]')$q$, (select id from t13_n)), '22023');
select t.raises('F: null patch -> 22023', format($q$select public.admin_update_company(%L, null)$q$, (select id from t13_n)), '22023');
select t.raises_msg('F: blank name', format($q$select public.admin_update_company(%L, '{"name":"  "}')$q$, (select id from t13_n)), '22023', 'invalid company name');
select t.raises_msg('F: null name', format($q$select public.admin_update_company(%L, '{"name":null}')$q$, (select id from t13_n)), '22023', 'invalid company name');
select t.raises_msg('F: bad country', format($q$select public.admin_update_company(%L, '{"country":"EGY"}')$q$, (select id from t13_n)), '22023', 'invalid country');
select t.raises_msg('F: bad contact email', format($q$select public.admin_update_company(%L, '{"contact_email":"nope"}')$q$, (select id from t13_n)), '22023', 'invalid contact email');
select t.raises('F: bad phone -> 22023', format($q$select public.admin_update_company(%L, '{"contact_phone":"abc"}')$q$, (select id from t13_n)), '22023');
select t.raises('F: unknown company -> P0002', $q$select public.admin_update_company('00000000-0000-4000-8000-0000000fffff', '{"name":"x"}')$q$, 'P0002');
select t.as_admin();
select t.eq('F: failed patches changed nothing', (select name from companies where id = (select id from t13_n)), 'Phase73 Renamed');
select t.eq('F: failed patches wrote no audit rows (still the two successful ones)', t.audits('company.updated', (select id from t13_n)), 2::bigint);
select t.eq('F: fixture companies untouched by update tests', (select count(*) from companies where id in (t.u(101), t.u(102)) and name in ('Company A','Company B')), 2::bigint);

-- ======================= G. STATUS =======================
-- G1: real lock-out on fixture company A
create temp table t13_a0 as select
  (select string_agg(id::text || status, ',' order by id) from trips where company_id = t.u(101)) as trips,
  (select string_agg(id::text || status, ',' order by id) from subscriptions where company_id = t.u(101)) as subs,
  (select count(*) from routes where company_id = t.u(101)) as routes;
grant select on t13_a0 to authenticated;
select t.as_user(t.u(1));
select t.raises_msg('G: suspend needs a reason', format($q$select public.admin_set_company_status(%L, 'suspended')$q$, t.u(101)), '22023', 'reason required');
select t.raises_msg('G: reason of 1 char is too short', format($q$select public.admin_set_company_status(%L, 'suspended', 'x')$q$, t.u(101)), '22023', 'reason required');
select t.raises_msg('G: reason of 600 chars is too long', format($q$select public.admin_set_company_status(%L, 'suspended', %L)$q$, t.u(101), repeat('x', 600)), '22023', 'reason required');
select t.raises_msg('G: unknown status', format($q$select public.admin_set_company_status(%L, 'deleted', 'valid reason')$q$, t.u(101)), '22023', 'invalid status');
select t.raises_msg('G: null status', format($q$select public.admin_set_company_status(%L, null, 'valid reason')$q$, t.u(101)), '22023', 'invalid status');
select t.raises_msg('G: active -> trial is not allowed', format($q$select public.admin_set_company_status(%L, 'trial')$q$, t.u(101)), '23514', 'invalid company status transition');
select t.raises_msg('G: active -> active is not a transition', format($q$select public.admin_set_company_status(%L, 'active')$q$, t.u(101)), '23514', 'invalid company status transition');
select t.raises('G: unknown company -> P0002', $q$select public.admin_set_company_status('00000000-0000-4000-8000-0000000fffff', 'active')$q$, 'P0002');
select t.as_admin();
select t.eq('G: failed attempts left A active', (select status from companies where id = t.u(101)), 'active');
select t.eq('G: failed attempts wrote no audit rows for A', (select count(*) from audit_logs where company_id = t.u(101) and action like 'company.%'), 0::bigint);

select t.as_user(t.u(1));
select t.passes('G: super_admin suspends A with a reason', format($q$select public.admin_set_company_status(%L, 'suspended', '  non-payment dispute  ')$q$, t.u(101)));
select t.as_admin();
select t.eq('G: A is suspended with timestamp and trimmed reason',
  (select status || '|' || (suspended_at is not null)::text || '|' || suspension_reason from companies where id = t.u(101)), 'suspended|true|non-payment dispute');
select t.eq('G: exactly one company.suspended row, before.status = active, reason recorded',
  (select count(*) from audit_logs where company_id = t.u(101) and action = 'company.suspended' and actor_id = t.u(1)
     and metadata->'before'->>'status' = 'active' and metadata->'after'->>'status' = 'suspended' and metadata->'after'->>'reason' = 'non-payment dispute'), 1::bigint);
select t.eq('G: subscription of A untouched by suspension',
  (select string_agg(id::text || status, ',' order by id) from subscriptions where company_id = t.u(101)), (select subs from t13_a0));
select t.eq('G: trips of A untouched by suspension',
  (select string_agg(id::text || status, ',' order by id) from trips where company_id = t.u(101)), (select trips from t13_a0));
select t.as_user(t.u(2));
select t.eq('G: owner A is locked out of routes while suspended', (select count(*) from routes), 0::bigint);
select t.as_user(t.u(6));
select t.eq('G: driver A is locked out of trips while suspended', (select count(*) from trips), 0::bigint);
select t.as_user(t.u(7));
select t.eq('G: company B is unaffected (owner B still sees B routes)', (select count(*) from routes) >= 1, true);
select t.as_user(t.u(9));
select t.eq('G: detail offers "active" as the resume status', public.admin_company_detail(t.u(101))->>'resume_status', 'active');
select t.as_user(t.u(1));
select t.raises_msg('G: suspended -> suspended', format($q$select public.admin_set_company_status(%L, 'suspended', 'again please')$q$, t.u(101)), '23514', 'invalid company status transition');
select t.passes('G: reactivate A', format($q$select public.admin_set_company_status(%L, 'active')$q$, t.u(101)));
select t.as_admin();
select t.eq('G: A active again, suspension fields cleared',
  (select status || '|' || (suspended_at is null)::text || '|' || (suspension_reason is null)::text from companies where id = t.u(101)), 'active|true|true');
select t.eq('G: exactly one company.reactivated row', t.audits('company.reactivated', t.u(101)), 1::bigint);
select t.as_user(t.u(2));
select t.eq('G: owner A sees routes again (fixture A has routes)', (select count(*) from routes) > 0 and (select routes from t13_a0) > 0, true);
select t.as_admin();

-- G2: full transition walk on the new company N
select t.as_user(t.u(1));
select t.passes('G: N trial -> suspended', format($q$select public.admin_set_company_status(%L, 'suspended', 'verification pending')$q$, (select id from t13_n)));
select t.eq('G: resume status after suspending a trial company is trial', public.admin_company_detail((select id from t13_n))->>'resume_status', 'trial');
select t.passes('G: N suspended -> trial', format($q$select public.admin_set_company_status(%L, 'trial')$q$, (select id from t13_n)));
select t.passes('G: N trial -> active', format($q$select public.admin_set_company_status(%L, 'active')$q$, (select id from t13_n)));
select t.as_admin();
select t.eq('G: N audit trail is suspended, reactivated, status_changed (one each)',
  (select string_agg(action, ',' order by action) from audit_logs where company_id = (select id from t13_n) and action in ('company.suspended','company.reactivated','company.status_changed')),
  'company.reactivated,company.status_changed,company.suspended');
select t.as_user(t.u(1));
select t.raises_msg('G: cancel needs a reason', format($q$select public.admin_set_company_status(%L, 'cancelled')$q$, (select id from t13_n)), '22023', 'reason required');
select t.passes('G: N active -> cancelled', format($q$select public.admin_set_company_status(%L, 'cancelled', 'contract ended')$q$, (select id from t13_n)));
select t.raises_msg('G: cancelled is terminal (-> active)', format($q$select public.admin_set_company_status(%L, 'active')$q$, (select id from t13_n)), '23514', 'invalid company status transition');
select t.raises_msg('G: cancelled is terminal (-> trial)', format($q$select public.admin_set_company_status(%L, 'trial')$q$, (select id from t13_n)), '23514', 'invalid company status transition');
select t.raises_msg('G: cancelled is terminal (-> suspended)', format($q$select public.admin_set_company_status(%L, 'suspended', 'valid reason')$q$, (select id from t13_n)), '23514', 'invalid company status transition');
select t.as_admin();
select t.eq('G: N is cancelled with suspension fields empty',
  (select status || '|' || (suspended_at is null)::text || '|' || (suspension_reason is null)::text from companies where id = (select id from t13_n)), 'cancelled|true|true');
select t.eq('G: exactly one company.cancelled row, reason in the after-snapshot',
  (select count(*) from audit_logs where company_id = (select id from t13_n) and action = 'company.cancelled' and metadata->'after'->>'reason' = 'contract ended'), 1::bigint);
select t.eq('G: status changes did not touch the subscription of N', (select status from subscriptions where company_id = (select id from t13_n)), 'trialing');
select t.eq('G: status changes did not touch the pending invite of N', (select count(*) from company_invites where company_id = (select id from t13_n) and status = 'pending'), 1::bigint);
select t.eq('G: fixture company C is still suspended (never touched)', (select status from companies where id = t.u(103)), 'suspended');

-- ======================= H. NOTES =======================
select t.as_user(t.u(1));
select t.passes('H: super_admin adds a note', format($q$select public.admin_add_note(%L, '  phase73: call back on Monday  ')$q$, t.u(102)));
select t.as_user(t.u(9));
select t.passes('H: support adds a note', format($q$select public.admin_add_note(%L, 'phase73: second note')$q$, t.u(102)));
select t.raises_msg('H: empty note', format($q$select public.admin_add_note(%L, '   ')$q$, t.u(102)), '22023', 'invalid note');
select t.raises_msg('H: note over 2000 chars', format($q$select public.admin_add_note(%L, %L)$q$, t.u(102), repeat('x', 2001)), '22023', 'invalid note');
select t.raises('H: unknown company -> P0002', $q$select public.admin_add_note('00000000-0000-4000-8000-0000000fffff', 'phase73: x')$q$, 'P0002');
select t.as_admin();
select t.eq('H: notes stored trimmed, authored by the caller, never by a client-supplied id',
  (select string_agg(body || '@' || (author_id = t.u(1))::text, ',' order by created_at) from company_notes where company_id = t.u(102) and body like 'phase73:%'),
  'phase73: call back on Monday@true,phase73: second note@false');
select t.eq('H: second note author is the support user', (select author_id from company_notes where company_id = t.u(102) and body = 'phase73: second note'), t.u(9));
select t.eq('H: exactly two company.note_added rows for B, actors recorded',
  (select count(*) from audit_logs where company_id = t.u(102) and action = 'company.note_added' and actor_type = 'platform_user' and actor_id in (t.u(1), t.u(9))), 2::bigint);
select t.eq('H: note text is not copied into the audit log',
  (select count(*) from audit_logs where company_id = t.u(102) and metadata::text like '%call back%'), 0::bigint);
select t.as_user(t.u(10));
select t.eq('H: billing can read the notes via detail', (select count(*) from jsonb_array_elements(public.admin_company_detail(t.u(102))->'notes') n where n->>'body' like 'phase73:%'), 2::bigint);
select t.as_user(t.u(7));
select t.eq('H: owner B cannot read platform notes directly', (select count(*) from company_notes), 0::bigint);
select t.as_admin();

-- ======================= I. NO SIDE DOORS, NO NOISE =======================
select t.as_user(t.u(1));
select t.raises('I: super_admin still cannot insert company_notes directly', format($q$insert into company_notes (company_id, body) values (%L, 'phase73: direct')$q$, t.u(101)), '42501');
select t.raises('I: super_admin still cannot insert companies directly', $q$insert into companies (name, slug) values ('Direct','phase73-direct')$q$, '42501');
select t.raises('I: super_admin still cannot update companies directly', format($q$update companies set name = 'Direct' where id = %L$q$, t.u(101)), '42501');
select t.as_admin();
create temp table t13_audit0 as select count(*) as n from audit_logs;
select t.raises_as('I: refused write calls', t.u(9), format($q$select public.admin_set_company_status(%L, 'suspended', 'support must not')$q$, t.u(101)), '42501');
select t.raises_as('I: refused write calls (owner)', t.u(2), format($q$select public.admin_update_company(%L, '{"name":"x"}')$q$, t.u(101)), '42501');
select t.passes_as('I: read calls', t.u(1), 'select public.admin_list_companies()');
select t.passes_as('I: read calls (detail)', t.u(10), format('select public.admin_company_detail(%L)', t.u(101)));
select t.eq('I: refused and read-only calls write no audit rows', (select count(*) from audit_logs), (select n from t13_audit0));
select t.raises('I: audit_logs stay append-only (delete)', $q$delete from audit_logs$q$, null);

-- ======================= J. CLEAN-UP + SOFT-DELETE VISIBILITY =======================
update companies set deleted_at = now() where id = (select id from t13_n);
delete from company_notes where body like 'phase73:%';
select t.as_user(t.u(1));
select t.eq('J: soft-deleted company is not listed', (public.admin_list_companies('phase73')->>'total')::bigint, 0::bigint);
select t.raises('J: soft-deleted company has no detail -> P0002', format('select public.admin_company_detail(%L)', (select id from t13_n)), 'P0002');
select t.raises('J: soft-deleted company cannot be updated -> P0002', format($q$select public.admin_update_company(%L, '{"name":"x"}')$q$, (select id from t13_n)), 'P0002');
select t.raises('J: soft-deleted company cannot change status -> P0002', format($q$select public.admin_set_company_status(%L, 'active')$q$, (select id from t13_n)), 'P0002');
select t.as_admin();
select t.eq('J: fixture companies back to their original state',
  (select string_agg(slug::text || ':' || status, ',' order by slug::text) from companies where id in (t.u(101), t.u(102), t.u(103))),
  'company-a:active,company-b:active,company-c:suspended');
