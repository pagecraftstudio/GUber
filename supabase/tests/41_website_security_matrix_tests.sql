-- 41: M3E-5 website editor + publishing security matrix (migrations 0043, 0046, 0047).
-- Complements 39 (publish RPC behaviour) and 40 (preview). This suite answers four questions:
--   A. ROLE MATRIX    every actor x every website operation (draft read/write + preview/publish/rollback/unpublish)
--   B. TENANT ISOLATION  Company B forges company_id / page_id / publication rows against Company A
--   C. INVALID PAYLOADS  size caps, note handling, hostile version numbers, nothing written on refusal
--   D. LIFECYCLE EDGES   subscription lapse, suspension, shared rate-limit budget, audit trail, per-company version counters
-- Fixtures (01): A = company 101 (professional), B = 102. Users: 1 super_admin, 2 ownerA, 3 managerA, 4 opsA, 5 bookingA,
--   6 driverA, 7 ownerB, 9 platform support, 10 platform billing.
-- Roles (0005/0043): website.read + website.write are held by owner and manager ONLY; website.publish likewise. Operations,
--   booking and driver hold none, so the D4 split (editor can save a draft, cannot go live) is tested with a TEMPORARY role below.
select t.as_admin();

create or replace function t.err41(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt41(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;

-- One probe -> Y (allowed) / N (refused or no row affected) / ?<sqlstate> (anything unexpected, so a typo can never read as a pass).
--   dml: allowed means at least one row was written (RLS hides rows silently on UPDATE/DELETE, so 0 rows = N)
--   rpc: allowed means the call was AUTHORIZED. 23514 (draft checklist) and P0002 (version not found) happen after authorization.
create or replace function t.tok41(p_sql text, p_kind text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  if p_kind = 'dml' then get diagnostics n = row_count; return case when n >= 1 then 'Y' else 'N' end; end if;
  return 'Y';
exception
  when sqlstate '42501' or sqlstate '28000' then return 'N';
  when sqlstate '23514' or sqlstate 'P0002' then return case when p_kind = 'rpc' then 'Y' else '?' || sqlstate end;
  when others then return '?' || sqlstate;
end $$;

-- Read probe: Y if at least one row is visible, N if none OR the role has no privilege at all (anon). Not t.rows: suite 02 replaces
-- that helper with one that LOGS an error as a failed result, and "anon has no SELECT grant" is an expected refusal here.
create or replace function t.read41(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return case when n > 0 then 'Y' else 'N' end;
exception when insufficient_privilege then return 'N';
end $$;

-- One actor against Company A's website. p_rpc = false for actors that own ANOTHER company (their RPCs would act on their own).
create or replace function t.matrix41(p_actor uuid, p_rpc boolean default true) returns text language plpgsql as $$
declare r text; v_read text;
begin
  if p_actor is null then perform t.as_anon(); else perform t.as_user(p_actor); end if;
  v_read := t.read41(format('select 1 from public.website_pages where company_id = %L', t.u(101)));
  r := 'read=' || v_read;
  r := r || ' page_w=' || t.tok41(format($q$insert into public.website_pages (company_id, slug, title) values (%L, %L, '{"en":"m41"}')$q$,
         t.u(101), 'm41-' || substr(md5(random()::text), 1, 8)), 'dml');
  r := r || ' section_w=' || t.tok41(format($q$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (%L, %L, 'about', 99, '{"body":{"en":"m41"}}')$q$,
         t.u(101), t.u(501)), 'dml');
  r := r || ' settings_w=' || t.tok41(format($q$update public.website_settings set primary_color = '#123456' where company_id = %L$q$, t.u(101)), 'dml');
  if p_rpc then
    r := r || ' preview='   || t.tok41('select public.preview_website_draft()', 'rpc');
    r := r || ' publish='   || t.tok41($q$select public.publish_website('m41')$q$, 'rpc');
    r := r || ' rollback='  || t.tok41('select public.rollback_website(999)', 'rpc');
    r := r || ' unpublish=' || t.tok41('select public.unpublish_website()', 'rpc');
  end if;
  perform t.as_admin();
  return r;
end $$;

-- audit_logs is append-only (even for superuser), so this suite never deletes audit rows: it counts rows since a marker instead.
create table if not exists t.mark41 (k text primary key, ts timestamptz not null);
truncate t.mark41;
insert into t.mark41 values ('start', clock_timestamp());

-- ================================================================================ clean slate + drafts for A and B
delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company B') where company_id = t.u(102);
insert into public.website_pages (id, company_id, slug, title, is_home) values
  (t.u(501), t.u(101), '', '{"en":"Home A"}', true),
  (t.u(502), t.u(102), '', '{"en":"Home B"}', true);
insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values
  (t.u(511), t.u(101), t.u(501), 'hero', 1, '{"title":{"en":"MARKER-A-DRAFT"}}'),
  (t.u(512), t.u(102), t.u(502), 'hero', 1, '{"title":{"en":"MARKER-B-DRAFT"}}');

-- ================================================================================ A. ROLE MATRIX
-- Legend: read = can see A's draft pages; *_w = wrote a row; preview/publish/rollback/unpublish = authorized.
select t.eq('A matrix: owner (website.read+write+publish)',
  t.matrix41(t.u(2)), 'read=Y page_w=Y section_w=Y settings_w=Y preview=Y publish=Y rollback=Y unpublish=Y');
select t.eq('A matrix: manager (same bundle as owner for the website)',
  t.matrix41(t.u(3)), 'read=Y page_w=Y section_w=Y settings_w=Y preview=Y publish=Y rollback=Y unpublish=Y');
select t.eq('A matrix: operations holds no website permission at all',
  t.matrix41(t.u(4)), 'read=N page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: booking staff holds no website permission at all',
  t.matrix41(t.u(5)), 'read=N page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: driver holds no website permission at all',
  t.matrix41(t.u(6)), 'read=N page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: anonymous visitor',
  t.matrix41(null), 'read=N page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
-- Platform staff have no company membership, so the tenant RPCs (preview/publish/rollback/unpublish) refuse them. By the platform_*
-- RLS policies (0006) every platform role can READ tenant drafts and super_admin can also WRITE them directly. Draft edits are not
-- audited (only publish/rollback/unpublish are) and a super_admin still cannot go live: see report observation O1.
select t.eq('A matrix: platform super_admin reads + writes drafts by policy, but cannot preview or publish (no membership)',
  t.matrix41(t.u(1)), 'read=Y page_w=Y section_w=Y settings_w=Y preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: platform support reads drafts, writes nothing',
  t.matrix41(t.u(9)), 'read=Y page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: platform billing reads drafts, writes nothing',
  t.matrix41(t.u(10)), 'read=Y page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');
select t.eq('A matrix: owner of ANOTHER company (B) forging company_id = A (DML only)',
  t.matrix41(t.u(7), false), 'read=N page_w=N section_w=N settings_w=N');

-- D4 at the database: a website EDITOR (draft only) is a custom role, because no seeded role is one.
select t.as_admin();
insert into public.roles (key, name) values ('website_editor_t41', 'Website editor (test only)');
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in ('website.read', 'website.write') where r.key = 'website_editor_t41';
update public.company_users set role_id = (select id from public.roles where key = 'website_editor_t41') where user_id = t.u(5);
delete from app_private.rate_limit_counters;
select t.eq('D4: an editor saves drafts and previews, but cannot publish, roll back or unpublish',
  t.matrix41(t.u(5)), 'read=Y page_w=Y section_w=Y settings_w=Y preview=Y publish=N rollback=N unpublish=N');
-- and a publisher without write could not edit (permissions are independent in both directions)
delete from public.role_permissions where role_id = (select id from public.roles where key = 'website_editor_t41');
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r join public.permissions p on p.key in ('website.read', 'website.publish') where r.key = 'website_editor_t41';
select t.eq('D4: a publisher without website.write goes live but cannot edit the draft',
  t.matrix41(t.u(5)), 'read=Y page_w=N section_w=N settings_w=N preview=Y publish=Y rollback=Y unpublish=Y');
-- restore
update public.company_users set role_id = (select id from public.roles where key = 'booking') where user_id = t.u(5);
delete from public.roles where key = 'website_editor_t41';
select t.eq('D4: fixture restored (booking staff again has nothing)', t.matrix41(t.u(5)), 'read=N page_w=N section_w=N settings_w=N preview=N publish=N rollback=N unpublish=N');

-- the matrix writes rows and publishes versions as it goes: discard them so later sections start from known state
select t.as_admin();
delete from public.website_publications;
update public.website_settings set is_published = false, primary_color = '#1d4ed8' where company_id = t.u(101);
delete from public.website_sections where company_id = t.u(101) and id <> t.u(511);
delete from public.website_pages where company_id = t.u(101) and id <> t.u(501);
delete from app_private.rate_limit_counters;
insert into t.mark41 values ('B', clock_timestamp());

-- ================================================================================ B. TENANT ISOLATION (B attacks A)
select t.as_user(t.u(7));
select t.eq('B forges: insert a page with company_id = A', t.err41(format($$insert into public.website_pages (company_id, slug, title) values (%L, 'evil', '{"en":"x"}')$$, t.u(101))), '42501');
select t.eq('B forges: insert a section with company_id = A on A''s page', t.err41(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (%L, %L, 'about', 1, '{"body":"x"}')$$, t.u(101), t.u(501))), '42501');
select t.eq('B forges: own company_id but A''s page_id (composite FK holds)', t.err41(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (%L, %L, 'about', 1, '{"body":"x"}')$$, t.u(102), t.u(501))), '23503');
select t.eq('B moves its own section onto A''s page (composite FK holds)', t.err41(format($$update public.website_sections set page_id = %L where id = %L$$, t.u(501), t.u(512))), '23503');
select t.eq('B re-parents its own section to company A', t.err41(format($$update public.website_sections set company_id = %L where id = %L$$, t.u(101), t.u(512))) <> 'NO ERROR', true);
select t.eq('B re-parents its own page to company A', t.err41(format($$update public.website_pages set company_id = %L where id = %L$$, t.u(101), t.u(502))) <> 'NO ERROR', true);
select t.eq('B updates A''s section: 0 rows', t.affected(format($$update public.website_sections set content = '{"title":{"en":"PWNED"}}' where id = %L$$, t.u(511))), 0::bigint);
select t.eq('B updates A''s page: 0 rows', t.affected(format($$update public.website_pages set is_published = false where id = %L$$, t.u(501))), 0::bigint);
select t.eq('B deletes A''s section: 0 rows', t.affected(format($$delete from public.website_sections where id = %L$$, t.u(511))), 0::bigint);
select t.eq('B deletes A''s page: 0 rows', t.affected(format($$delete from public.website_pages where id = %L$$, t.u(501))), 0::bigint);
select t.eq('B updates A''s settings: 0 rows', t.affected(format($$update public.website_settings set site_title = '{"en":"PWNED"}' where company_id = %L$$, t.u(101))), 0::bigint);
select t.eq('B reads none of A''s draft pages/sections/settings',
  t.rows(format('select 1 from public.website_pages where company_id = %L', t.u(101))) + t.rows(format('select 1 from public.website_sections where company_id = %L', t.u(101)))
  + t.rows(format('select 1 from public.website_settings where company_id = %L', t.u(101))), 0::bigint);
select t.as_admin();
select t.eq('B forgeries left A untouched',
  (select (select content->'title'->>'en' from public.website_sections where id = t.u(511)) || '|' || (select site_title->>'en' from public.website_settings where company_id = t.u(101))
     || '|' || (select count(*) from public.website_pages where company_id = t.u(101))), 'MARKER-A-DRAFT|Company A|1');

-- publications are written by the RPCs only: not even the OWNER of the company can touch them directly
select t.as_user(t.u(2));
select t.eq('publications: owner cannot INSERT directly', t.err41(format($$insert into public.website_publications (company_id, version, snapshot, is_current) values (%L, 77, '{}', true)$$, t.u(101))), '42501');
select t.eq('publications: owner cannot DELETE directly', t.err41($$delete from public.website_publications$$), '42501');
select t.as_admin();
select t.as_user(t.u(2));
select t.eq('publish A v1 (the RPC is the only writer)', public.publish_website('seed'), 1);
select t.eq('publications: owner UPDATE of is_current affects no row (no UPDATE policy for tenants)',
  t.affected($$update public.website_publications set is_current = false$$), 0::bigint);
select t.as_admin();
select t.eq('publications: the RPC publication is still current after the attempts', (select count(*) from public.website_publications where is_current), 1::bigint);

-- B's preview and publish act on B only, and A's marker never appears in B's answer
select t.as_user(t.u(7));
select t.eq('preview: B sees B''s draft marker', (public.preview_website_draft()::text) like '%MARKER-B-DRAFT%', true);
select t.eq('preview: B never sees A''s draft marker', (public.preview_website_draft()::text) like '%MARKER-A-DRAFT%', false);
select t.eq('publish: B''s first version is v1 (per-company counter), although A is also at v1', public.publish_website('b first'), 1);
select t.as_user(t.u(2));
select t.eq('publish: A''s second version is v2, unaffected by B', public.publish_website('a second'), 2);
select t.eq('preview: A never sees B''s draft marker', (public.preview_website_draft()::text) like '%MARKER-B-DRAFT%', false);
select t.as_admin();
select t.eq('publish: each company has exactly one current version',
  (select string_agg(company_id::text || '=' || n, ',' order by company_id) from (select company_id, count(*)::text as n from public.website_publications where is_current group by company_id) q),
  t.u(101)::text || '=1,' || t.u(102)::text || '=1');
select t.eq('publish: audit rows carry the right company and actor',
  (select string_agg(x, ',' order by x) from (select distinct company_id::text || ':' || coalesce(actor_id::text, 'null') as x from public.audit_logs
      where action = 'website.publish' and created_at >= (select ts from t.mark41 where k = 'B')) q),
  t.u(101)::text || ':' || t.u(2)::text || ',' || t.u(102)::text || ':' || t.u(7)::text);
select t.as_anon();
select t.eq('public: by host, A serves A (never B)', public.get_public_site('a.test', null)->'company'->>'slug', 'company-a');
select t.eq('public: B is published but its only host is pending, so it is still not served', public.get_public_site('b.test', null) is null, true);
select t.eq('public: A''s snapshot holds A''s marker only', (public.get_public_site('a.test', null)::text) like '%MARKER-B-DRAFT%', false);
select t.as_admin();

-- ================================================================================ C. INVALID PAYLOADS
-- content size cap (< 256 kB per section): refused by the CHECK constraint, by every write path
select t.as_user(t.u(2));
select t.eq('size: a section just under the cap is accepted',
  t.err41($$insert into public.website_sections (company_id, page_id, type, sort_order, content) select company_id, id, 'about', 40, jsonb_build_object('body', repeat('a', 200000)) from public.website_pages where id = '$$ || t.u(501) || $$'$$), 'NO ERROR');
select t.eq('size: a section over 256 kB is refused (CHECK)',
  t.err41($$insert into public.website_sections (company_id, page_id, type, sort_order, content) select company_id, id, 'about', 41, jsonb_build_object('body', repeat('b', 270000)) from public.website_pages where id = '$$ || t.u(501) || $$'$$), '23514');
select t.eq('size: the same cap holds on UPDATE',
  t.err41(format($$update public.website_sections set content = jsonb_build_object('body', repeat('c', 270000)) where id = %L$$, t.u(511))), '23514');
select t.as_admin();
delete from public.website_sections where company_id = t.u(101) and sort_order in (40, 41);

-- note handling: trimmed, capped at 500 by the database, stored as inert text (rendered escaped by the UI)
select t.as_user(t.u(2));
select public.publish_website(repeat('n', 600) || ' tail');
select public.publish_website('   ');
select public.publish_website('<script>alert(1)</script> & "q"');
select public.publish_website(null);
select t.as_admin();
select t.eq('note: 600 chars are cut to 500 by the database (the service refuses > 500 earlier; this is the backstop)',
  (select length(note) from public.website_publications where company_id = t.u(101) and version = 3), 500);
select t.eq('note: whitespace-only becomes NULL', (select note is null from public.website_publications where company_id = t.u(101) and version = 4), true);
select t.eq('note: HTML is stored verbatim as text (never interpreted server side)', (select note from public.website_publications where company_id = t.u(101) and version = 5), '<script>alert(1)</script> & "q"');
select t.eq('note: NULL stays NULL', (select note is null from public.website_publications where company_id = t.u(101) and version = 6), true);
select t.eq('note: the audit row keeps at most the capped note (no unbounded text in audit)',
  (select max(length(metadata->>'note')) <= 500 from public.audit_logs where action = 'website.publish' and company_id = t.u(101)), true);

-- hostile version numbers never create a row and never reveal anything
select t.as_user(t.u(2));
select t.eq('rollback: NULL version -> not found', t.err41($$select public.rollback_website(null)$$), 'P0002');
select t.eq('rollback: 0 -> not found', t.err41($$select public.rollback_website(0)$$), 'P0002');
select t.eq('rollback: negative -> not found', t.err41($$select public.rollback_website(-5)$$), 'P0002');
select t.eq('rollback: int max -> not found', t.err41($$select public.rollback_website(2147483647)$$), 'P0002');
select t.eq('rollback: B''s version number does not exist for A either way (A has 1..6, B has 1)', t.err41($$select public.rollback_website(7)$$), 'P0002');
select t.as_admin();
select t.eq('rollback: refused attempts created no version', (select max(version) from public.website_publications where company_id = t.u(101)), 6);

-- an oversized SITE (many sections, each under the section cap) must be refused as a whole and write nothing
select t.as_user(t.u(2));
select t.eq('size: 6 sections of 200 kB are individually fine',
  t.err41($$insert into public.website_sections (company_id, page_id, type, sort_order, content)
            select p.company_id, p.id, 'about', 50 + g, jsonb_build_object('body', repeat('x', 200000)) from public.website_pages p, generate_series(1, 6) g where p.id = '$$ || t.u(501) || $$'$$), 'NO ERROR');
select t.as_admin();
select t.as_user(t.u(2));
select t.eq('size: but the snapshot over 1 MB is refused (54000)', t.err41($$select public.publish_website('too big')$$), '54000');
select t.eq('size: and the preview refuses it the same way', t.err41($$select public.preview_website_draft()$$), '54000');
select t.as_admin();
select t.eq('size: the refused publish wrote nothing and left v6 current',
  (select count(*) || ':' || max(version) filter (where is_current) from public.website_publications where company_id = t.u(101)), '6:6');
delete from public.website_sections where company_id = t.u(101) and sort_order >= 50;

-- ================================================================================ D. LIFECYCLE EDGES
-- unpublish is the escape hatch: it works even when the subscription has lapsed (publish/rollback do not, see 39)
update public.subscriptions set current_period_end = now() - interval '1 day' where company_id = t.u(101) and status = 'active';
select t.as_user(t.u(2));
select t.eq('lapsed subscription: publish refused', t.err41($$select public.publish_website('x')$$), '42501');
select t.eq('lapsed subscription: unpublish STILL works (a lapsed company can always take its site down)', t.err41($$select public.unpublish_website()$$), 'NO ERROR');
select t.eq('lapsed subscription: unpublish is idempotent', t.err41($$select public.unpublish_website()$$), 'NO ERROR');
select t.as_admin();
select t.eq('lapsed subscription: site is down, no current version',
  (select (select is_published::text from public.website_settings where company_id = t.u(101)) || ':' || count(*) filter (where is_current) from public.website_publications where company_id = t.u(101)), 'false:0');
update public.subscriptions set current_period_end = now() + interval '30 days' where company_id = t.u(101) and status = 'active';

-- rollback while unpublished brings the site back (copy-forward, is_published true again)
select t.as_user(t.u(2));
select t.eq('rollback while unpublished creates v7', public.rollback_website(1), 7);
select t.as_admin();
select t.eq('rollback while unpublished: site is live again on exactly one current version',
  (select (select is_published::text from public.website_settings where company_id = t.u(101)) || ':' || string_agg(version::text, ',') filter (where is_current) from public.website_publications where company_id = t.u(101)), 'true:7');

-- suspension takes the controls away, including unpublish (platform staff must act, see 39 for publish)
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_user(t.u(2));
select t.eq('suspended: unpublish refused', t.err41($$select public.unpublish_website()$$), '42501');
select t.eq('suspended: preview refused', t.err41($$select public.preview_website_draft()$$), '42501');
select t.as_admin();
update public.companies set status = 'active', suspended_at = null where id = t.u(101);

-- one rate-limit budget (10 per 10 min) is shared by publish + rollback + unpublish, per USER
delete from app_private.rate_limit_counters;
insert into t.mark41 values ('D', clock_timestamp());
select t.as_user(t.u(2));
select public.publish_website('r' || g) from generate_series(1, 4) g;
select public.rollback_website(1) from generate_series(1, 3) g;
select public.unpublish_website() from generate_series(1, 3) g;
select t.eq('rate limit: 4 publish + 3 rollback + 3 unpublish used the owner''s ten', t.err41($$select public.publish_website('11th')$$), 'PT429');
select t.eq('rate limit: the shared budget also refuses an unpublish', t.err41($$select public.unpublish_website()$$), 'PT429');
select t.eq('rate limit: ...and a rollback', t.err41($$select public.rollback_website(1)$$), 'PT429');
select t.as_user(t.u(3));
select t.eq('rate limit: the manager has a separate budget', t.err41($$select public.publish_website('mgr')$$), 'NO ERROR');
select t.as_user(t.u(7));
select t.eq('rate limit: company B''s owner is unaffected by A''s exhaustion', t.err41($$select public.publish_website('b again')$$), 'NO ERROR');
select t.as_admin();
select t.eq('rate limit: refusals wrote no audit rows (exactly one row per successful call: 4+3+3 owner + 1 manager)',
  (select count(*) from public.audit_logs where company_id = t.u(101) and action in ('website.publish', 'website.rollback', 'website.unpublish')
      and created_at >= (select ts from t.mark41 where k = 'D')), 11::bigint);
select t.eq('audit: metadata of a rollback names the restored version, not the content',
  (select (metadata ? 'restored_version') and not (metadata::text like '%MARKER%') from public.audit_logs where company_id = t.u(101) and action = 'website.rollback' limit 1), true);

-- invariants that must hold after ANY sequence of the above
select t.eq('invariant: version numbers per company are unique and gapless',
  (select bool_and(max_v = cnt and min_v = 1) from (select company_id, max(version) max_v, min(version) min_v, count(*) cnt from public.website_publications group by company_id) q), true);
select t.eq('invariant: at most one current version per company',
  (select coalesce(max(c), 0) <= 1 from (select count(*) c from public.website_publications where is_current group by company_id) q), true);
select t.eq('invariant: is_published equals "a current version exists", for every company',
  (select count(*) from public.website_settings s where s.is_published is distinct from exists (select 1 from public.website_publications p where p.company_id = s.company_id and p.is_current)
      and s.company_id in (t.u(101), t.u(102))), 0::bigint);

-- ================================================================================ E. anon direct table access (state of 0046, see report D2)
-- Anon still has table SELECT on website_publications until D2 lands. What it may see must at least be limited to the CURRENT
-- version of an ACTIVE company with a serving host. (Which COLUMNS it may read is the D2 gap: supabase/tests/proposed/.)
select t.as_anon();
select t.eq('anon table: sees only current rows of companies with a serving host', t.rows('select 1 from public.website_publications where not is_current'), 0::bigint);
select t.eq('anon table: B (pending host only) is invisible', t.rows(format('select 1 from public.website_publications where company_id = %L', t.u(102))), 0::bigint);
select t.eq('anon table: cannot write', t.err41(format($$insert into public.website_publications (company_id, version, snapshot) values (%L, 99, '{}')$$, t.u(101))), '42501');
select t.eq('anon table: cannot update', t.err41($$update public.website_publications set is_current = false$$), '42501');
select t.as_admin();
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_anon();
select t.eq('anon table: a suspended company disappears', t.rows(format('select 1 from public.website_publications where company_id = %L', t.u(101))), 0::bigint);
select t.as_admin();
update public.companies set status = 'active', suspended_at = null where id = t.u(101);

-- ================================================================================ cleanup: later suites share this database
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = (company_id = t.u(101)), site_title = null, primary_color = '#1d4ed8', social_links = '{}' where company_id in (t.u(101), t.u(102));
delete from app_private.rate_limit_counters;
drop table if exists t.mark41;
