-- 14: Phase 7.4 subscription management RPCs (0018). Requires 01 fixtures; run after 11, 12 and 13.
-- Fixture companies/subscriptions A, B, C are never modified. Two throw-away companies are created through the 7.3 RPC and
-- soft-deleted at the end. Audit rows are append-only and stay by design.

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
create or replace function t.raises_as(name text, who uuid, stmt text, state text) returns void language plpgsql as
  $$ begin
       if who is null then perform t.as_anon(); else perform t.as_user(who); end if;
       perform t.raises(name, stmt, state);
       perform t.as_admin();
     end $$;
create or replace function t.passes_as(name text, who uuid, stmt text) returns void language plpgsql as
  $$ begin perform t.as_user(who); perform t.passes(name, stmt); perform t.as_admin(); end $$;
create or replace function t.audits(p_action text, p_company uuid) returns bigint language sql as
  $$ select count(*) from public.audit_logs where action = p_action and company_id = p_company $$;
create or replace function t.sworld() returns text language sql as $$
  select concat_ws('|', (select count(*) from public.companies), (select count(*) from public.subscriptions),
                        (select count(*) from public.audit_logs),
                        (select md5(string_agg(s::text, '|' order by s.id::text)) from public.subscriptions s)) $$;

-- ---------- setup: two disposable companies through the 7.3 RPC ----------
select t.as_user(t.u(1));
create temp table t14_c as select
  (public.admin_create_company('Phase74 One', 'phase74-one', null, null, null, null, null, 'starter', 14, 'phase74-one@test.dev')->>'company_id')::uuid as n1,
  (public.admin_create_company('Phase74 Two', 'phase74-two', null, null, null, null, null, 'starter', 14, 'phase74-two@test.dev')->>'company_id')::uuid as n2;
grant select on t14_c to authenticated;
select t.as_admin();
create temp table t14_fix as select
  (select string_agg(s::text, '|' order by s.id::text) from subscriptions s where company_id in (t.u(101), t.u(102), t.u(103))) as fixtures;

-- ======================= A. WHO MAY CALL WHAT =======================
select t.passes_as('A: super_admin may list', t.u(1), 'select public.admin_list_subscriptions()');
select t.passes_as('A: support may list', t.u(9), 'select public.admin_list_subscriptions()');
select t.passes_as('A: billing may list', t.u(10), 'select public.admin_list_subscriptions()');

create temp table t14_nobody (who uuid, label text);
insert into t14_nobody values (t.u(2),'owner A'),(t.u(3),'manager A'),(t.u(6),'driver A'),(t.u(7),'owner B'),
  ('99999999-9999-4999-8999-999999999999','user without profile'),(null,'anon');
create temp table t14_nowrite (who uuid, label text);
insert into t14_nowrite select * from t14_nobody;
insert into t14_nowrite values (t.u(9),'support');

select t.raises_as('A: ' || label || ' cannot list', who, 'select public.admin_list_subscriptions()', '42501') from t14_nobody;
select t.raises_as('A: ' || label || ' cannot assign', who,
  format($q$select public.admin_assign_subscription(%L, 'professional', 'monthly', 'active', 30)$q$, t.u(101)), '42501') from t14_nowrite;
select t.raises_as('A: ' || label || ' cannot change status', who,
  format($q$select public.admin_set_subscription_status((select id from subscriptions where company_id = %L and status = 'active'), 'cancelled', 'not allowed')$q$, t.u(101)), '42501') from t14_nowrite;
select t.raises_as('A: ' || label || ' cannot change period', who,
  format($q$select public.admin_set_subscription_period((select id from subscriptions where company_id = %L and status = 'active'), 5)$q$, t.u(101)), '42501') from t14_nowrite;
select t.raises_as('A: ' || label || ' cannot run expiry', who, 'select public.admin_expire_subscriptions()', '42501') from t14_nowrite;
select t.eq('A: refused calls changed nothing', (select string_agg(s::text, '|' order by s.id::text) from subscriptions s where company_id in (t.u(101), t.u(102), t.u(103))), (select fixtures from t14_fix));

-- ======================= B. FUNCTION HARDENING =======================
create temp table t14_fn (sig text);
insert into t14_fn values ('public.admin_list_subscriptions(text,text,text,text,integer,integer)'),
  ('public.admin_assign_subscription(uuid,text,text,text,integer)'), ('public.admin_set_subscription_status(uuid,text,text)'),
  ('public.admin_set_subscription_period(uuid,integer,text)'), ('public.admin_expire_subscriptions()');
select t.eq('B: ' || sig || ' is security definer with empty search_path',
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = sig::regprocedure), true) from t14_fn;
select t.eq('B: ' || sig || ' anon has no EXECUTE', has_function_privilege('anon', sig, 'execute'), false) from t14_fn;
select t.eq('B: ' || sig || ' authenticated has EXECUTE', has_function_privilege('authenticated', sig, 'execute'), true) from t14_fn;
select t.eq('B: no function takes a role, actor or user parameter',
  (select count(*) from pg_proc p, unnest(coalesce(p.proargnames, '{}'::text[])) a
    where p.oid in (select sig::regprocedure from t14_fn) and a ~* 'role|actor|user'), 0::bigint);

-- ======================= C. LIST =======================
select t.as_user(t.u(9));
select t.eq('C: total equals subscriptions of live companies', (public.admin_list_subscriptions()->>'total')::bigint,
  (select count(*) from subscriptions s join companies c on c.id = s.company_id and c.deleted_at is null));
select t.eq('C: A row is live on the professional plan',
  (select e->>'plan_code' || '|' || (e->>'state') from jsonb_array_elements(public.admin_list_subscriptions('company-a')->'items') e where e->>'company_slug' = 'company-a'), 'professional|live');
select t.eq('C: status filter total matches (active, raw status)', (public.admin_list_subscriptions(null,'active')->>'total')::bigint,
  (select count(*) from subscriptions s join companies c on c.id = s.company_id and c.deleted_at is null where s.status = 'active'));
select t.eq('C: LIKE wildcard % is escaped', (public.admin_list_subscriptions('%')->>'total')::bigint, 0::bigint);
select t.eq('C: LIKE wildcard _ is escaped', (public.admin_list_subscriptions('_')->>'total')::bigint, 0::bigint);
select t.eq('C: page_size 1 returns one item', jsonb_array_length(public.admin_list_subscriptions(null,null,'created_at','desc',1,1)->'items'), 1);
select t.raises('C: bad state -> 22023', $$select public.admin_list_subscriptions(null,'bogus')$$, '22023');
select t.raises('C: injection in sort -> 22023', $$select public.admin_list_subscriptions(null,null,'id; drop table subscriptions','asc')$$, '22023');
select t.raises('C: bad direction -> 22023', $$select public.admin_list_subscriptions(null,null,'period_end','up')$$, '22023');
select t.raises('C: page 0 -> 22023', $$select public.admin_list_subscriptions(null,null,'period_end','asc',0,25)$$, '22023');
select t.raises('C: page_size 101 -> 22023', $$select public.admin_list_subscriptions(null,null,'period_end','asc',1,101)$$, '22023');
select t.as_admin();

-- ======================= D. ASSIGN =======================
create temp table t14_w0 as select t.sworld() as w;
select t.as_user(t.u(10));   -- billing may assign
create temp table t14_a1 as select public.admin_assign_subscription((select n1 from t14_c), 'professional', 'yearly', 'active', 365) as j;
grant select on t14_a1 to authenticated;
select t.as_admin();
select t.eq('D: old trialing row retired to expired, history kept',
  (select count(*) from subscriptions where company_id = (select n1 from t14_c) and status = 'expired'), 1::bigint);
select t.eq('D: exactly one live-status row, the new one',
  (select count(*) || '|' || min(status) from subscriptions where company_id = (select n1 from t14_c) and status in ('trialing','active','past_due')), '1|active');
select t.eq('D: new row is professional, yearly, ~365 days',
  (select p.code || '|' || s.billing_interval || '|' || round(extract(epoch from s.current_period_end - s.current_period_start) / 86400)::int
     from subscriptions s join plans p on p.id = s.plan_id where s.id = (select (j->>'subscription_id')::uuid from t14_a1)), 'professional|yearly|365');
select t.eq('D: result names the replaced row', (select (j->>'replaced_subscription_id')::uuid from t14_a1),
  (select id from subscriptions where company_id = (select n1 from t14_c) and status = 'expired'));
select t.eq('D: entitlement checks now use the professional plan',
  (select ls.plan_id from app_private.live_subscription((select n1 from t14_c)) ls), (select id from plans where code = 'professional'));
select t.eq('D: exactly one subscription.assigned row by the billing user with before and after',
  (select count(*) from audit_logs where action = 'subscription.assigned' and company_id = (select n1 from t14_c) and actor_id = t.u(10) and actor_type = 'platform_user'
     and metadata->'before'->>'status' = 'trialing' and metadata->'before'->>'plan_code' = 'starter'
     and metadata->'after'->>'plan_code' = 'professional' and metadata->'after'->>'status' = 'active'), 1::bigint);
select t.eq('D: the old row is not edited in place (still starter)', (select p.code from subscriptions s join plans p on p.id = s.plan_id
   where s.company_id = (select n1 from t14_c) and s.status = 'expired'), 'starter');

-- failures write nothing
create temp table t14_w1 as select t.sworld() as w;
select t.as_user(t.u(1));
select t.raises_msg('D: unknown plan', format($q$select public.admin_assign_subscription(%L, 'nope', 'monthly', 'active', 30)$q$, (select n1 from t14_c)), '22023', 'unknown plan');
select t.raises_msg('D: null plan', format($q$select public.admin_assign_subscription(%L, null, 'monthly', 'active', 30)$q$, (select n1 from t14_c)), '22023', 'unknown plan');
select t.raises_msg('D: bad interval', format($q$select public.admin_assign_subscription(%L, 'starter', 'weekly', 'active', 30)$q$, (select n1 from t14_c)), '22023', 'invalid billing interval');
select t.raises_msg('D: status past_due is not assignable', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'past_due', 30)$q$, (select n1 from t14_c)), '22023', 'invalid subscription status');
select t.raises_msg('D: status expired is not assignable', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'expired', 30)$q$, (select n1 from t14_c)), '22023', 'invalid subscription status');
select t.raises_msg('D: 0 days', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', 0)$q$, (select n1 from t14_c)), '22023', 'invalid period');
select t.raises_msg('D: 1831 days', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', 1831)$q$, (select n1 from t14_c)), '22023', 'invalid period');
select t.raises_msg('D: null days', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', null)$q$, (select n1 from t14_c)), '22023', 'invalid period');
select t.raises('D: unknown company -> P0002', $q$select public.admin_assign_subscription('00000000-0000-4000-8000-0000000fffff', 'starter', 'monthly', 'active', 30)$q$, 'P0002');
select t.as_admin();
select t.eq('D: no failure wrote a row, changed a row or audited', t.sworld(), (select w from t14_w1));

-- stale handling: the unique index counts a stale live-status row as live, so assign must retire it
update subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '1 day'
 where company_id = (select n1 from t14_c) and status = 'active';
select t.eq('D: stale row no longer counts as live for entitlements', (select count(*) from app_private.live_subscription((select n1 from t14_c))), 0::bigint);
select t.as_user(t.u(1));
select t.passes('D: assign over a stale row succeeds', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'trialing', 14)$q$, (select n1 from t14_c)));
select t.as_admin();
select t.eq('D: stale row was expired, one live row remains',
  (select count(*) filter (where status = 'expired') || '|' || count(*) filter (where status in ('trialing','active','past_due')) from subscriptions where company_id = (select n1 from t14_c)), '2|1');
select t.eq('D: trialing assign sets trial_ends_at to the period end',
  (select trial_ends_at = current_period_end from subscriptions where company_id = (select n1 from t14_c) and status = 'trialing'), true);

-- ======================= E. STATUS =======================
select t.as_user(t.u(10));
select t.passes('E: trialing -> active', format($q$select public.admin_set_subscription_status((select id from subscriptions where company_id = %L and status = 'trialing'), 'active')$q$, (select n1 from t14_c)));
select t.as_admin();
select t.eq('E: audited as status_changed (before trialing, after active)',
  (select count(*) from audit_logs where action = 'subscription.status_changed' and company_id = (select n1 from t14_c)
     and metadata->'before'->>'status' = 'trialing' and metadata->'after'->>'status' = 'active'), 1::bigint);
select t.as_user(t.u(1));
create temp table t14_s as select id from subscriptions where company_id = (select n1 from t14_c) and status = 'active';
grant select on t14_s to authenticated;
select t.passes('E: active -> past_due', format($q$select public.admin_set_subscription_status(%L, 'past_due')$q$, (select id from t14_s)));
select t.passes('E: past_due -> active', format($q$select public.admin_set_subscription_status(%L, 'active')$q$, (select id from t14_s)));
select t.raises_msg('E: active -> active is not a transition', format($q$select public.admin_set_subscription_status(%L, 'active')$q$, (select id from t14_s)), '23514', 'invalid subscription status transition');
select t.raises_msg('E: trialing is never a target', format($q$select public.admin_set_subscription_status(%L, 'trialing')$q$, (select id from t14_s)), '22023', 'invalid subscription status');
select t.raises_msg('E: unknown status', format($q$select public.admin_set_subscription_status(%L, 'paused')$q$, (select id from t14_s)), '22023', 'invalid subscription status');
select t.raises_msg('E: cancel needs a reason', format($q$select public.admin_set_subscription_status(%L, 'cancelled')$q$, (select id from t14_s)), '22023', 'reason required');
select t.raises_msg('E: short reason', format($q$select public.admin_set_subscription_status(%L, 'expired', 'x')$q$, (select id from t14_s)), '22023', 'reason required');
select t.raises('E: unknown subscription -> P0002', $q$select public.admin_set_subscription_status('00000000-0000-4000-8000-0000000fffff', 'active')$q$, 'P0002');
select t.as_admin();
select t.eq('E: active row untouched by the failed calls', (select status from subscriptions where id = (select id from t14_s)), 'active');
select t.eq('E: failed calls added no audit rows (3 successful status changes so far)',
  (select count(*) from audit_logs where action = 'subscription.status_changed' and company_id = (select n1 from t14_c)), 3::bigint);

-- period ended: target live statuses are refused until the period is extended
update subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '1 day' where id = (select id from t14_s);
select t.as_user(t.u(1));
select t.raises_msg('E: stale row cannot go to past_due', format($q$select public.admin_set_subscription_status(%L, 'past_due')$q$, (select id from t14_s)), '23514', 'subscription period ended');
select t.passes('E: stale row can still be cancelled', format($q$select public.admin_set_subscription_status(%L, 'cancelled', '  customer left  ')$q$, (select id from t14_s)));
select t.as_admin();
select t.eq('E: cancelled row has cancelled_at set', (select cancelled_at is not null from subscriptions where id = (select id from t14_s)), true);
select t.eq('E: one subscription.cancelled row with the trimmed reason',
  (select count(*) from audit_logs where action = 'subscription.cancelled' and company_id = (select n1 from t14_c) and metadata->'after'->>'reason' = 'customer left'), 1::bigint);
select t.raises_msg('E: no live subscription -> entitlement check fails closed', format($q$select app_private.entitlement_limit(%L, 'max_buses')$q$, (select n1 from t14_c)), '42501', 'no active subscription');
select t.as_user(t.u(1));
select t.raises_msg('E: cancelled is terminal (-> active)', format($q$select public.admin_set_subscription_status(%L, 'active')$q$, (select id from t14_s)), '23514', 'invalid subscription status transition');
select t.raises_msg('E: cancelled is terminal (-> expired)', format($q$select public.admin_set_subscription_status(%L, 'expired', 'again please')$q$, (select id from t14_s)), '23514', 'invalid subscription status transition');
select t.as_admin();

-- ======================= F. PERIOD =======================
select t.as_user(t.u(1));
select t.passes('F: assign a fresh trial to company one', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'trialing', 10)$q$, (select n1 from t14_c)));
select t.as_admin();
create temp table t14_p as select id, current_period_end as e0 from subscriptions where company_id = (select n1 from t14_c) and status = 'trialing';
grant select on t14_p to authenticated;
select t.as_user(t.u(10));
select t.passes('F: extend 30 days from the current end', format($q$select public.admin_set_subscription_period(%L, 30, 'current_end')$q$, (select id from t14_p)));
select t.as_admin();
select t.eq('F: new end = old end + 30 days', (select current_period_end = (select e0 from t14_p) + interval '30 days' from subscriptions where id = (select id from t14_p)), true);
select t.eq('F: a trialing row keeps trial_ends_at equal to the period end', (select trial_ends_at = current_period_end from subscriptions where id = (select id from t14_p)), true);
select t.eq('F: audit row has old and new end',
  (select count(*) from audit_logs where action = 'subscription.period_changed' and company_id = (select n1 from t14_c)
     and metadata->'after'->>'from' = 'current_end' and (metadata->'after'->>'days')::int = 30
     and (metadata->'before'->>'period_end')::timestamptz = (select e0 from t14_p)), 1::bigint);
select t.as_user(t.u(1));
select t.passes('F: set to 5 days from now (shortening is allowed and audited)', format($q$select public.admin_set_subscription_period(%L, 5)$q$, (select id from t14_p)));
select t.as_admin();
select t.eq('F: end is about 5 days away', (select current_period_end between now() + interval '4 days 23 hours' and now() + interval '5 days 1 hour' from subscriptions where id = (select id from t14_p)), true);
select t.eq('F: two period_changed rows now', t.audits('subscription.period_changed', (select n1 from t14_c)), 2::bigint);
select t.as_user(t.u(1));
select t.raises_msg('F: 0 days', format($q$select public.admin_set_subscription_period(%L, 0)$q$, (select id from t14_p)), '22023', 'invalid period');
select t.raises_msg('F: 1831 days', format($q$select public.admin_set_subscription_period(%L, 1831)$q$, (select id from t14_p)), '22023', 'invalid period');
select t.raises_msg('F: bad base', format($q$select public.admin_set_subscription_period(%L, 5, 'yesterday')$q$, (select id from t14_p)), '22023', 'invalid period');
select t.raises_msg('F: null days', format($q$select public.admin_set_subscription_period(%L, null)$q$, (select id from t14_p)), '22023', 'invalid period');
select t.raises('F: unknown subscription -> P0002', $q$select public.admin_set_subscription_period('00000000-0000-4000-8000-0000000fffff', 5)$q$, 'P0002');
select t.raises_msg('F: a cancelled row cannot be extended', format($q$select public.admin_set_subscription_period(%L, 5)$q$, (select id from t14_s)), '23514', 'subscription not extendable');
select t.as_admin();
-- reviving a stale live-status row by extending it
update subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '1 day' where id = (select id from t14_p);
select t.eq('F: stale before the extension', (select count(*) from app_private.live_subscription((select n1 from t14_c))), 0::bigint);
select t.as_user(t.u(1));
select t.passes('F: extend a stale row from now', format($q$select public.admin_set_subscription_period(%L, 10)$q$, (select id from t14_p)));
select t.as_admin();
select t.eq('F: the stale row is live again', (select count(*) from app_private.live_subscription((select n1 from t14_c))), 1::bigint);
select t.eq('F: three period_changed rows in total (30 days, 5 days, revival)',
  (select count(*) from audit_logs where action = 'subscription.period_changed' and company_id = (select n1 from t14_c)), 3::bigint);
update subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '9 days' where id = (select id from t14_p);
select t.as_user(t.u(1));
select t.raises_msg('F: current end 9 days ago + 2 days is still in the past', format($q$select public.admin_set_subscription_period(%L, 2, 'current_end')$q$, (select id from t14_p)), '22023', 'invalid period');
select t.as_admin();

-- ======================= G. EXPIRE =======================
-- company two gets a stale row too; the fixtures never go stale
update subscriptions set current_period_start = now() - interval '20 days', current_period_end = now() - interval '2 days' where company_id = (select n2 from t14_c) and status = 'trialing';
create temp table t14_stale as select id, company_id from subscriptions where status in ('trialing','active','past_due') and current_period_end <= now();
create temp table t14_ex0 as select count(*) as n from audit_logs where action = 'subscription.expired';
select t.eq('G: company one and two are both stale (plus any other stale rows already in the database)', (select count(*) from t14_stale) >= 2, true);
select t.as_user(t.u(10));
create temp table t14_x1 as select public.admin_expire_subscriptions() as j;
grant select on t14_x1 to authenticated;
select t.as_admin();
select t.eq('G: result counts exactly the stale rows', (select (j->>'expired')::bigint from t14_x1), (select count(*) from t14_stale));
select t.eq('G: none left stale', (select count(*) from subscriptions where status in ('trialing','active','past_due') and current_period_end <= now()), 0::bigint);
select t.eq('G: every flipped row is expired', (select count(*) from subscriptions s join t14_stale x on x.id = s.id where s.status = 'expired'), (select count(*) from t14_stale));
select t.eq('G: exactly one subscription.expired audit row per flipped subscription',
  (select count(*) from audit_logs where action = 'subscription.expired') - (select n from t14_ex0), (select count(*) from t14_stale));
select t.eq('G: each audit row carries the company and the period_ended reason',
  (select count(*) from audit_logs a join t14_stale x on x.id = a.entity_id where a.action = 'subscription.expired' and a.company_id = x.company_id
     and a.actor_id = t.u(10) and a.metadata->'after'->>'reason' = 'period_ended'), (select count(*) from t14_stale));
select t.eq('G: fixture subscriptions untouched', (select string_agg(s::text, '|' order by s.id::text) from subscriptions s where company_id in (t.u(101), t.u(102), t.u(103))), (select fixtures from t14_fix));
create temp table t14_ex1 as select count(*) as n from audit_logs;
select t.as_user(t.u(1));
create temp table t14_x2 as select public.admin_expire_subscriptions() as j;
grant select on t14_x2 to authenticated;
select t.as_admin();
select t.eq('G: second run expires nothing (idempotent)', (select (j->>'expired')::bigint from t14_x2), 0::bigint);
select t.eq('G: second run writes no audit rows', (select count(*) from audit_logs), (select n from t14_ex1));

-- ======================= H. NO SIDE DOORS =======================
select t.as_user(t.u(10));
select t.raises('H: billing cannot update subscriptions directly', $q$update subscriptions set status = 'active'$q$, '42501');
select t.raises('H: billing cannot insert subscriptions directly', format($q$insert into subscriptions (company_id, plan_id, status, billing_interval, current_period_start, current_period_end)
   values (%L, (select id from plans limit 1), 'active', 'monthly', now(), now() + interval '1 day')$q$, t.u(101)), '42501');
select t.as_user(t.u(1));
select t.raises('H: super_admin cannot update subscriptions directly', $q$update subscriptions set status = 'active'$q$, '42501');
select t.raises('H: super_admin cannot delete subscriptions', $q$delete from subscriptions$q$, '42501');
select t.as_user(t.u(2));
select t.raises('H: tenant owner cannot update subscriptions', $q$update subscriptions set status = 'cancelled'$q$, '42501');
select t.as_admin();

-- ======================= I. NO NOISE FROM REFUSED OR READ CALLS =======================
create temp table t14_n0 as select count(*) as n from audit_logs;
select t.raises_as('I: support write refused', t.u(9), 'select public.admin_expire_subscriptions()', '42501');
select t.raises_as('I: owner write refused', t.u(2), format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', 5)$q$, t.u(101)), '42501');
select t.passes_as('I: list is read-only', t.u(9), 'select public.admin_list_subscriptions()');
select t.eq('I: refused and read calls wrote no audit rows', (select count(*) from audit_logs), (select n from t14_n0));

-- ======================= J. COMPANY RULES + CLEAN-UP =======================
select t.as_user(t.u(1));
select t.passes('J: cancel company two (7.3 RPC)', format($q$select public.admin_set_company_status(%L, 'cancelled', 'cleanup after tests')$q$, (select n2 from t14_c)));
select t.raises_msg('J: cannot assign to a cancelled company', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', 30)$q$, (select n2 from t14_c)), '23514', 'company cancelled');
select t.as_admin();
update companies set deleted_at = now() where id in ((select n1 from t14_c), (select n2 from t14_c));
select t.as_user(t.u(1));
select t.eq('J: soft-deleted companies vanish from the subscription list', (public.admin_list_subscriptions('phase74')->>'total')::bigint, 0::bigint);
select t.raises('J: soft-deleted company -> P0002 on assign', format($q$select public.admin_assign_subscription(%L, 'starter', 'monthly', 'active', 30)$q$, (select n1 from t14_c)), 'P0002');
select t.raises('J: subscription of a soft-deleted company -> P0002', format($q$select public.admin_set_subscription_period(%L, 5)$q$, (select id from t14_p)), 'P0002');
select t.as_admin();
select t.eq('J: fixture subscriptions still exactly as they were', (select string_agg(s::text, '|' order by s.id::text) from subscriptions s where company_id in (t.u(101), t.u(102), t.u(103))), (select fixtures from t14_fix));
