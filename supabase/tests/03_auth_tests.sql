-- Phase 3 auth RPC tests. Run AFTER migrations 0001-0007, 01_helpers_fixtures.sql and (optionally) 02_tests.sql.
-- Self-contained helpers (idempotent). Re-runnable: it removes its own fixtures first.
-- Uses users 21-24 and company A (professional) / B (starter) from the 01 fixtures.
create schema if not exists t;
grant usage on schema t to anon, authenticated;
create table if not exists t.results (id serial primary key, ok boolean not null, name text not null, detail text);
alter table t.results disable row level security;
grant all on t.results to anon, authenticated;
grant usage on sequence t.results_id_seq to anon, authenticated;
create table if not exists t.tokens (label text primary key, token text, invite_id uuid);
alter table t.tokens disable row level security;
grant all on t.tokens to anon, authenticated;

create or replace function t.u(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function t.as_user(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', p::text, false); set role authenticated; end $$;
create or replace function t.as_anon() returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); set role anon; end $$;
create or replace function t.as_admin() returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
create or replace function t.eq(name text, got anyelement, want anyelement) returns void language plpgsql as
  $$ begin
       if got is not distinct from want then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('got %s, want %s',got,want)); raise notice 'FAIL  % (got %, want %)', name, got, want; end if;
     end $$;
create or replace function t.raises(name text, stmt text, state text default null) returns void language plpgsql as
  $$ begin
       execute stmt;
       insert into t.results(ok,name,detail) values (false,name,'no error'); raise notice 'FAIL  % (no error)', name;
     exception when others then
       if state is null or sqlstate = state then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s, want %s: %s',sqlstate,state,sqlerrm)); raise notice 'FAIL  % (sqlstate %, want %: %)', name, sqlstate, state, sqlerrm; end if;
     end $$;
create or replace function t.passes(name text, stmt text) returns void language plpgsql as
  $$ begin
       execute stmt; insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
     exception when others then insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s: %s',sqlstate,sqlerrm)); raise notice 'FAIL  % (sqlstate %: %)', name, sqlstate, sqlerrm;
     end $$;

-- ---------- clean + fixtures (superuser) ----------
select t.as_admin();
delete from t.tokens;
delete from t.results where name like 'auth: %';
delete from company_users where user_id in (t.u(21), t.u(22), t.u(23), t.u(24));
delete from company_invites where email::text like '%@auth03.test';
insert into auth.users (id, email, email_confirmed_at) values
  (t.u(21), 'invitee1@auth03.test', now()),     -- confirmed, matches invite 1
  (t.u(22), 'invitee2@auth03.test', null),      -- NOT confirmed
  (t.u(23), 'other@auth03.test',    now()),     -- confirmed, wrong person
  (t.u(24), 'revoked@auth03.test',  now())      -- confirmed, invite will be revoked
on conflict (id) do update set email = excluded.email, email_confirmed_at = excluded.email_confirmed_at;

-- ===== create_invite: authorization =====
select t.as_user(t.u(2));   -- owner A
select t.passes('auth: owner creates invite (manager)', $$insert into t.tokens select 'inv1', token, invite_id from create_invite('Invitee1@Auth03.test ', 'manager')$$);
select t.passes('auth: owner creates 2nd invite (unconfirmed email user)', $$insert into t.tokens select 'inv2', token, invite_id from create_invite('invitee2@auth03.test', 'driver')$$);
select t.passes('auth: owner creates 3rd invite (to be revoked)', $$insert into t.tokens select 'inv3', token, invite_id from create_invite('revoked@auth03.test', 'booking')$$);
select t.eq('auth: raw token has 64 hex chars', (select length(token) from t.tokens where label = 'inv1'), 64);
select t.raises('auth: duplicate pending invite rejected', $$select * from create_invite('invitee1@auth03.test', 'manager')$$, '23505');
select t.raises('auth: invalid email rejected', $$select * from create_invite('not-an-email', 'manager')$$, '22023');
select t.raises('auth: unknown role rejected', $$select * from create_invite('x1@auth03.test', 'god')$$, '22023');
select t.raises('auth: cannot invite existing member of another company', $$select * from create_invite('u7@test.dev', 'manager')$$, '23505');
select t.raises('auth: owner A cannot invite into company B (id supplied)', $$select * from create_invite('x2@auth03.test', 'manager', t.u(102))$$, '42501');
select t.passes('auth: owner A passing own company id is fine', $$select * from create_invite('x3@auth03.test', 'manager', t.u(101))$$);
select t.as_user(t.u(3));   -- manager: no users.write
select t.raises('auth: manager cannot create invite', $$select * from create_invite('x4@auth03.test', 'manager')$$, '42501');
select t.as_user(t.u(4));   -- operations
select t.raises('auth: operations cannot create invite', $$select * from create_invite('x5@auth03.test', 'manager')$$, '42501');
select t.as_user(t.u(8));   -- owner of suspended company C
select t.raises('auth: suspended company owner cannot invite', $$select * from create_invite('x6@auth03.test', 'manager')$$, '42501');
select t.as_anon();
select t.raises('auth: anon cannot create invite', $$select * from create_invite('x7@auth03.test', 'manager')$$, '42501');
select t.as_user(t.u(1));   -- super admin
select t.raises('auth: super_admin must name a company', $$select * from create_invite('x8@auth03.test', 'owner')$$, '22023');
select t.passes('auth: super_admin invites owner into B', $$select * from create_invite('b-owner2@auth03.test', 'owner', t.u(102))$$);
select t.raises('auth: super_admin cannot invite into suspended company', $$select * from create_invite('x9@auth03.test', 'owner', t.u(103))$$, '42501');
select t.as_user(t.u(9));   -- support: read-only platform role
select t.raises('auth: platform support cannot invite', $$select * from create_invite('x10@auth03.test', 'owner', t.u(101))$$, '42501');

-- ===== token storage =====
select t.as_admin();
select t.eq('auth: raw token never stored', (select count(*) from company_invites ci join t.tokens k on k.token = ci.token_hash), 0::bigint);
select t.eq('auth: sha256(token) stored', (select count(*) from company_invites ci join t.tokens k on k.label = 'inv1' and ci.token_hash = encode(sha256(convert_to(k.token, 'utf8')), 'hex')), 1::bigint);
select t.eq('auth: email normalised to lower/trimmed', (select email::text from company_invites where id = (select invite_id from t.tokens where label = 'inv1')), 'invitee1@auth03.test');
select t.eq('auth: invite.created audited', (select count(*) > 0 from audit_logs where action = 'invite.created' and company_id = t.u(101)), true);

-- ===== preview_invite =====
select t.as_anon();
select t.eq('auth: anon preview valid token -> 1 row', (select count(*) from preview_invite((select token from t.tokens where label = 'inv1'))), 1::bigint);
select t.eq('auth: preview exposes company name', (select company_name from preview_invite((select token from t.tokens where label = 'inv1'))), 'Company A');
select t.eq('auth: preview bad token -> 0 rows', (select count(*) from preview_invite('nope')), 0::bigint);
select t.eq('auth: preview null token -> 0 rows', (select count(*) from preview_invite(null)), 0::bigint);

-- ===== accept_invite =====
select t.as_anon();
select t.raises('auth: anon cannot accept', $$select * from accept_invite('x')$$, '42501');
select t.as_user(t.u(23));  -- wrong person holds inv1 token
select t.raises('auth: wrong email cannot accept (token stolen)', $$select * from accept_invite((select token from t.tokens where label = 'inv1'))$$, 'P0001');
select t.raises('auth: garbage token rejected', $$select * from accept_invite('garbage')$$, 'P0001');
select t.as_user(t.u(22));  -- right email, not confirmed
select t.raises('auth: unconfirmed email cannot accept', $$select * from accept_invite((select token from t.tokens where label = 'inv2'))$$, 'P0001');
select t.as_user(t.u(21));  -- right person
select t.eq('auth: before accept user has no company', (select count(*) from my_company), 0::bigint);
select t.passes('auth: invitee accepts', $$select * from accept_invite((select token from t.tokens where label = 'inv1'))$$);
select t.eq('auth: membership created in company A', (select (my_context() -> 'membership' ->> 'company_id')::uuid), t.u(101));
select t.eq('auth: role from invite applied', (select my_context() -> 'membership' ->> 'role_key'), 'manager');
select t.raises('auth: token cannot be reused', $$select * from accept_invite((select token from t.tokens where label = 'inv1'))$$, 'P0001');
select t.as_admin();
select t.eq('auth: invite marked accepted', (select status from company_invites where id = (select invite_id from t.tokens where label = 'inv1')), 'accepted');
select t.eq('auth: accepted_by set', (select accepted_by from company_invites where id = (select invite_id from t.tokens where label = 'inv1')), t.u(21));
select t.eq('auth: invite.accepted audited', (select count(*) > 0 from audit_logs where action = 'invite.accepted' and company_id = t.u(101)), true);

-- ===== revoke_invite =====
select t.as_user(t.u(7));   -- owner of B tries to revoke A's invite
select t.raises('auth: other tenant cannot revoke', $$select revoke_invite((select invite_id from t.tokens where label = 'inv3'))$$, '42501');
select t.as_user(t.u(3));   -- manager A
select t.raises('auth: manager cannot revoke', $$select revoke_invite((select invite_id from t.tokens where label = 'inv3'))$$, '42501');
select t.as_user(t.u(2));
select t.raises('auth: unknown invite id -> same forbidden error', $$select revoke_invite(t.u(999))$$, '42501');
select t.passes('auth: owner revokes own invite', $$select revoke_invite((select invite_id from t.tokens where label = 'inv3'))$$);
select t.as_user(t.u(24));
select t.raises('auth: revoked invite cannot be accepted', $$select * from accept_invite((select token from t.tokens where label = 'inv3'))$$, 'P0001');
select t.as_anon();
select t.eq('auth: revoked invite not previewable', (select count(*) from preview_invite((select token from t.tokens where label = 'inv3'))), 0::bigint);

-- ===== expiry =====
select t.as_admin();
update company_invites set expires_at = now() - interval '1 hour' where id = (select invite_id from t.tokens where label = 'inv2');
select t.as_user(t.u(22));
select t.raises('auth: expired invite rejected', $$select * from accept_invite((select token from t.tokens where label = 'inv2'))$$, 'P0001');
select t.as_user(t.u(2));
select t.passes('auth: expired pending invite can be re-issued', $$select * from create_invite('invitee2@auth03.test', 'driver')$$);

-- ===== my_context =====
select t.as_user(t.u(2));
select t.eq('auth: owner ctx role', (select my_context() -> 'membership' ->> 'role_key'), 'owner');
select t.eq('auth: owner ctx has users.write', (select my_context() -> 'membership' -> 'permissions' ? 'users.write'), true);
select t.eq('auth: owner ctx no platform role', (select my_context() ->> 'platform_role'), null);
select t.as_user(t.u(4));
select t.eq('auth: operations ctx lacks users.write', (select my_context() -> 'membership' -> 'permissions' ? 'users.write'), false);
select t.eq('auth: operations ctx has trips.write', (select my_context() -> 'membership' -> 'permissions' ? 'trips.write'), true);
select t.as_user(t.u(1));
select t.eq('auth: super_admin ctx role', (select my_context() ->> 'platform_role'), 'super_admin');
select t.eq('auth: super_admin has no membership', (select my_context() ->> 'membership' is null), true);
select t.as_user(t.u(8));
select t.eq('auth: suspended ctx shows status', (select my_context() -> 'membership' ->> 'company_status'), 'suspended');
select t.eq('auth: suspended ctx has zero permissions', (select jsonb_array_length(my_context() -> 'membership' -> 'permissions')), 0);
select t.as_user(t.u(23));
select t.eq('auth: stranger ctx has no membership', (select my_context() ->> 'membership'), null);
select t.as_anon();
select t.raises('auth: anon cannot call my_context', 'select my_context()', '42501');
select t.as_admin();
update profiles set is_active = false where id = t.u(4);
select t.as_user(t.u(4));
select t.eq('auth: deactivated profile gets no membership/permissions', (select my_context() ->> 'membership'), null);
select t.as_admin();
update profiles set is_active = true where id = t.u(4);

-- ===== cleanup + report =====
select t.as_admin();
delete from company_users where user_id in (t.u(21), t.u(22), t.u(23), t.u(24));
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where name like 'auth: %';
select id, name, detail from t.results where not ok and name like 'auth: %' order by id;
