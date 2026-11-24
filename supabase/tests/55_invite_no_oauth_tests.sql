-- 55: staff accounts are password-only (migration 0059). Needs 01 (users, owner t.u(2) of company A) and 03 (t.tokens).
select t.as_admin();
delete from t.results where name like 'oauth-invite: %';
delete from t.tokens where label like 'oi55-%';
delete from company_users where user_id in (t.u(5501), t.u(5502), t.u(5503));
delete from company_invites where email::text like '%@oi55.test';
insert into auth.users (id, email, email_confirmed_at) values
  (t.u(5501), 'plain@oi55.test',  now()),   -- email identity only
  (t.u(5502), 'google@oi55.test', now()),   -- Google identity only (signed in with Google first)
  (t.u(5503), 'both@oi55.test',   now())    -- email + Google (Google auto-linked to a password account)
on conflict (id) do update set email = excluded.email, email_confirmed_at = excluded.email_confirmed_at;
delete from auth.identities where user_id in (t.u(5501), t.u(5502), t.u(5503));
insert into auth.identities (user_id, provider) values (t.u(5501), 'email'), (t.u(5502), 'google'), (t.u(5503), 'email'), (t.u(5503), 'google');

select t.as_user(t.u(2));
select t.passes('oauth-invite: owner invites the three people', $$
  insert into t.tokens select 'oi55-plain',  token, invite_id from create_invite('plain@oi55.test', 'booking');
  insert into t.tokens select 'oi55-google', token, invite_id from create_invite('google@oi55.test', 'booking');
  insert into t.tokens select 'oi55-both',   token, invite_id from create_invite('both@oi55.test', 'booking')$$);

select t.as_user(t.u(5502));
select t.raises('oauth-invite: a Google-only account cannot become staff', $$select * from accept_invite((select token from t.tokens where label = 'oi55-google'))$$, 'P0001');
select t.as_user(t.u(5503));
select t.raises('oauth-invite: a password account with Google linked cannot become staff', $$select * from accept_invite((select token from t.tokens where label = 'oi55-both'))$$, 'P0001');
select t.as_admin();
select t.eq('oauth-invite: neither refusal created a membership', (select count(*) from company_users where user_id in (t.u(5502), t.u(5503))), 0::bigint);
select t.eq('oauth-invite: the refused invites stay pending (nothing consumed)', (select count(*) from company_invites where email::text in ('google@oi55.test', 'both@oi55.test') and status = 'pending'), 2::bigint);

select t.as_user(t.u(5501));
select t.passes('oauth-invite: an email-only account still accepts normally', $$select * from accept_invite((select token from t.tokens where label = 'oi55-plain'))$$);
select t.as_admin();
select t.eq('oauth-invite: ...and becomes a member', (select count(*) from company_users where user_id = t.u(5501)), 1::bigint);
-- cleanup so later suites see no extra members
delete from company_users where user_id in (t.u(5501), t.u(5502), t.u(5503));
