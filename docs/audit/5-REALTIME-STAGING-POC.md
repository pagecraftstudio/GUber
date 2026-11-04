# Realtime security proof-of-concept — STAGING ONLY. NOT EXECUTED. No success is claimed.
Runs only on a real staging Supabase project the owner controls. Never on production. The audit session did not run any of this.
Companion script: `poc/poc-realtime.mjs` (draft; `node --check` passes; never executed against a project).
All names are `poc:`-prefixed and everything is removed at the end. No change to any business table, policy or grant.

## 0. Preconditions (owner)
- Staging project ref known; you are in its SQL editor as `postgres`. Record the Realtime settings page (Dashboard > Realtime > Settings): is "Allow public access" on or off? Do NOT change it during the first run; note it (it decides whether public channels exist).
- A confirmed staging customer test account (email+password, no company membership). Publishable key only; the script refuses a service/secret key.
- `npm i @supabase/supabase-js` in a scratch folder.

## 1. Baseline snapshot (read-only; run BEFORE any change; save the output)
```sql
begin read only;
-- 1a policies/grants/RLS on the realtime schema
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname;
select grantee, privilege_type from information_schema.role_table_grants where table_schema='realtime' and table_name='messages' order by 1,2;
select relrowsecurity as rls_on from pg_class where oid = 'realtime.messages'::regclass;
-- 1b signature check: does realtime.send exist and with which arguments?
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='realtime' and p.proname in ('send','broadcast_changes','topic');
-- 1c business-table exposure fingerprint (must be identical at the end)
select 'table_privs' k, md5(string_agg(c.relname||':'||has_table_privilege('anon',c.oid,'select')||has_table_privilege('authenticated',c.oid,'select')||has_table_privilege('anon',c.oid,'insert')||has_table_privilege('authenticated',c.oid,'insert')||has_table_privilege('authenticated',c.oid,'update')||has_table_privilege('authenticated',c.oid,'delete'), ',' order by c.relname)) v
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p');
select 'public_policies' k, md5(string_agg(tablename||':'||policyname||':'||cmd||':'||coalesce(roles::text,'')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname)) v from pg_policies where schemaname='public';
select 'rls_flags' k, md5(string_agg(c.relname||':'||c.relrowsecurity||c.relforcerowsecurity, ',' order by c.relname)) v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select 'anon_exec_public_fns' k, md5(coalesce(string_agg(p.proname, ',' order by p.proname),'')) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute');
select 'direct_trips_bookings_customers_tickets_select' k,
  (select string_agg(t||'=anon:'||has_table_privilege('anon','public.'||t,'select')||'/auth:'||has_table_privilege('authenticated','public.'||t,'select'), ', ') from unnest(array['trips','bookings','customers','tickets']) t) v;
rollback;
```
Browser/Node baseline (REST exposure, before the policy exists):
`PHASE=before ROLE=anon node poc-realtime.mjs` and `PHASE=before ROLE=customer ... node poc-realtime.mjs` — at this point T1/T2 are EXPECTED to fail (no policy yet); only keep the `rest` block. Press Ctrl+C after "T6 REST snapshot" if you do not want to wait for the T2 timeout.

## 2. Setup (staging write, owner only)
```sql
-- policy: read-only receive on exactly ONE PoC topic; no insert/update/delete policy of any kind
create policy poc_receive_one_topic on realtime.messages
  for select to anon, authenticated
  using ( (select realtime.topic()) = 'poc:marketplace:v1' and realtime.messages.extension = 'broadcast' );
```
(Policy shape follows Supabase's Realtime Authorization pattern; exact function names/columns must match what step 1b/1a printed. If `realtime.topic()` or the `extension` column differ, STOP and report: that is finding B2.)

## 3. Tests
For ROLE in `anon`, then `customer`:
```
export SUPABASE_URL=https://<staging-ref>.supabase.co SUPABASE_ANON_KEY=<publishable key>
export CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=...   # customer run only
PHASE=after ROLE=anon node poc-realtime.mjs
PHASE=after ROLE=customer node poc-realtime.mjs
```
The script prints a `select realtime.send(...)` line with a random nonce: paste it into the SQL editor within 60 s.
| ID | Step | Expected (PASS) | If not |
|---|---|---|---|
| T1 | anon joins private topic `poc:marketplace:v1` | status `SUBSCRIBED` | policy/role/Realtime-auth problem -> design option D2 fails; fallback = polling-only |
| T2 | owner runs `realtime.send(..., 'invalidate', 'poc:marketplace:v1', true)` | event with the nonce received within 60 s | delivery or policy problem |
| T3 | client calls `channel.send` on the same private topic | message NOT delivered to the other subscriber or to itself; send reports error/ack failure | clients can publish -> private channel gives no anti-spoof; hints are still harmless (invalidation-only) but flag it |
| T4 | join `poc:other` (no policy) | join refused (`CHANNEL_ERROR`/unauthorized), or if joined, an event sent by owner to `poc:other` is NOT delivered | topic isolation broken -> STOP |
| T5 | `track()` presence | not ok / error | presence unexpectedly granted |
| T6 | REST `GET /rest/v1/{trips,bookings,customers,tickets}` and `Accept-Profile: realtime` `messages` with anon key, then with customer token | JSON in `poc-result-<role>-after.json` identical to the `before` file for the SAME role (statuses, row counts, error codes) | any difference = new exposure -> STOP |
| T7 | customer vs anon | the two `after` result files have identical T1-T5 verdicts (authenticated has NO extra privilege on the PoC topic) | extra privilege -> tighten policy (`to anon` only) |
SQL after the run (read-only) — all five fingerprints must equal the step-1c output byte for byte:
```sql
-- repeat block 1c; then also:
select policyname, cmd, roles from pg_policies where schemaname='realtime' and tablename='messages';  -- only poc_receive_one_topic added, cmd = SELECT
select count(*) from realtime.messages where topic like 'poc:%';                                   -- messages exist only for poc topics
```
Browser variant (optional, same checks from a real browser): open any page of the staging app with devtools, run the T1-T4 logic through `supabase-js` in the console with the publishable key; or serve `poc-realtime.mjs` logic from a static HTML file. Expected results identical.

## 4. Pass criteria (all must hold; record actual results, do not paraphrase)
1 T1+T2 PASS for anon. 2 T3, T4, T5 PASS for both roles. 3 T7 identical verdicts. 4 T6 files identical before/after for both roles. 5 All fingerprints in 1c identical after. 6 Step 1b output recorded (confirms `realtime.send` signature). 7 `realtime.messages` retention/columns noted (`inserted_at`, topic, extension) for the canary query in report 4 §3.2.
If any item fails: do not proceed to implementation; report the exact output.

## 5. Cleanup (staging write, owner)
```sql
drop policy if exists poc_receive_one_topic on realtime.messages;
-- test rows expire by Realtime retention; if you have the privilege and want them gone now:
-- delete from realtime.messages where topic like 'poc:%';
```
Then re-run 1a and confirm the policy list equals the baseline. Sign the customer test account out; keep or delete it per your policy.

## 6. Result log (fill in; leave blank until actually run)
| Item | Date/time | Operator | anon | customer | Evidence (file names) |
|---|---|---|---|---|---|
| T1 | | | | | |
| T2 | | | | | |
| T3 | | | | | |
| T4 | | | | | |
| T5 | | | | | |
| T6 | | | | | |
| 1c fingerprints equal | | | | | |
| `realtime.send` signature | | | | | |
STATUS: NOT RUN. Realtime private-channel security is UNPROVEN until this table is filled from a real staging project.
