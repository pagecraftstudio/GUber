# Realtime security proof-of-concept, rev 2 — STAGING ONLY — STATUS: NOT RUN
Nothing in this document has been executed against any Supabase project. No security property is claimed to hold. Every "Actual" cell is empty or "NOT RUN" until the OWNER supplies evidence files from a real staging project. This document supersedes report 5.
Script: `poc/poc-realtime-rev2.mjs` (syntax-checked with `node --check`; never run against a project).
The audit sandbox did not and will not run this.

## 1. What changed from rev 1 (report 5)
| Item | Rev 1 | Rev 2 |
|---|---|---|
| T3 client publish | one subscriber, "not delivered" | two or three independent clients; positive control before AND after; sender status recorded verbatim; WebSocket send AND HTTP broadcast attempt; server echo to the sender (`self:true`); 15 s observation; verdict table that refuses to accept "no delivery" without controls |
| T4 unauthorized topic | join status only | join transcript + owner-sent event to the unauthorized topic + cross-topic leak check on an authorized channel + 4 spelling variants + 2 per-user topics + a second no-policy topic; controls |
| Evidence | verdict only | per-test evidence list (§3.2) saved to JSON |
| Parity | T7 | explicit rule (§3.3) |
| Safety | implicit | §4 review, stop conditions, narrowed cleanup |
| Guards | publishable-key check | also requires `STAGING_PROJECT_REF` in the URL and refuses `PRODUCTION_PROJECT_REF` |

## 2. Preconditions and stop conditions
Owner has a staging Supabase project (never production), SQL editor as `postgres`, a confirmed staging customer test account with NO company membership, only the publishable key in the environment. Record the Realtime settings (Dashboard > Realtime > Settings, "Allow public access"); do not change it.
STOP (do not proceed, report the output) if any of these is true in step 1a/1b:
- `realtime.messages` has `relrowsecurity = false`.
- Any existing policy on `realtime.messages` allows `anon` or `authenticated` to SELECT with a broad or unconditional predicate (e.g. `true`, `LIKE '%'`): it would make `poc:other` receivable and invalidate T4.
- `realtime.send` or `realtime.topic()` does not exist with the signature the SQL below uses.
- The project ref is the production ref.

## 3. Procedure

### 3.0 Record the start time (staging, read-only)
```sql
select now() as poc_start_utc, current_database();   -- note it: it bounds the narrowed cleanup in §5
```
### 3.1 Steps
P0 — log-level probe (read-only effect: writes one WARNING line to the Postgres log, no data):
```sql
do $$ begin raise warning 'poc_log_probe_%', to_char(clock_timestamp(),'HH24MISS'); end $$;
```
Then find `poc_log_probe_` in Dashboard > Logs > Postgres logs. If it does not appear (log level or retention), record that: warning-based observability in report 6 is then unverified.
1a baseline (read-only):
```sql
begin read only;
select relrowsecurity as rls_on from pg_class where oid = 'realtime.messages'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname;
select grantee, privilege_type from information_schema.role_table_grants where table_schema='realtime' and table_name='messages' order by 1,2;
select column_name, data_type from information_schema.columns where table_schema='realtime' and table_name='messages' order by ordinal_position;  -- confirms inserted_at/topic/extension/payload names
select min(inserted_at) as oldest, max(inserted_at) as newest, count(*) from realtime.messages;                                              -- retention R for report 6 canary
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='realtime' and p.proname in ('send','broadcast_changes','topic');
-- 1c fingerprints (save all outputs; they must be byte-identical at the end)
select 'table_privs' k, md5(string_agg(c.relname||':'||has_table_privilege('anon',c.oid,'select')||has_table_privilege('authenticated',c.oid,'select')||has_table_privilege('anon',c.oid,'insert')||has_table_privilege('authenticated',c.oid,'insert')||has_table_privilege('authenticated',c.oid,'update')||has_table_privilege('authenticated',c.oid,'delete'), ',' order by c.relname)) v
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p');
select 'public_policies' k, md5(string_agg(tablename||':'||policyname||':'||cmd||':'||coalesce(roles::text,'')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname)) v from pg_policies where schemaname='public';
select 'rls_flags' k, md5(string_agg(c.relname||':'||c.relrowsecurity||c.relforcerowsecurity, ',' order by c.relname)) v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select 'anon_exec_public_fns' k, md5(coalesce(string_agg(p.proname, ',' order by p.proname),'')) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute');
select 'direct_select_trips_bookings_customers_tickets' k, (select string_agg(t||'=anon:'||has_table_privilege('anon','public.'||t,'select')||'/auth:'||has_table_privilege('authenticated','public.'||t,'select'), ', ') from unnest(array['trips','bookings','customers','tickets']) t) v;
rollback;
```
1d REST baseline BEFORE any change: `PHASE=before ROLE=anon node poc-realtime-rev2.mjs`, then `PHASE=before ROLE=customer ...`. The T1–T5 verdicts of the "before" run are expected to be non-PASS (no policy yet); keep only the `rest` block. (Interrupt after the T6 snapshot is not possible mid-script; let it time out.)
2 Setup — the ONLY write on the staging project (a single policy):
```sql
create policy poc_receive_one_topic on realtime.messages
  for select to anon, authenticated
  using ( (select realtime.topic()) = 'poc:marketplace:v1' and realtime.messages.extension = 'broadcast' );
```
No INSERT/UPDATE/DELETE policy is created. Permissive policies are OR-ed, so this can only ADD read access, and only for the exact string `poc:marketplace:v1` (equality, not LIKE).
3 Run, for each role: `export SUPABASE_URL=... SUPABASE_ANON_KEY=... STAGING_PROJECT_REF=... PRODUCTION_PROJECT_REF=...`; `PHASE=after ROLE=anon node poc-realtime-rev2.mjs`; `PHASE=after ROLE=customer CUSTOMER_EMAIL=... CUSTOMER_PASSWORD=... node poc-realtime-rev2.mjs`. The script prints each `select now() as owner_sent_at, realtime.send(...)` line with a nonce; paste it into the SQL editor within 90 s and copy the `owner_sent_at` value into your log.
4 Re-run the 1c fingerprint block and the following; all five fingerprints must equal step 1c:
```sql
select policyname, cmd, roles from pg_policies where schemaname='realtime' and tablename='messages' order by policyname;  -- only poc_receive_one_topic added; cmd = SELECT
select topic, count(*) from realtime.messages where inserted_at >= '<poc_start_utc>' group by topic order by 1;           -- only poc: topics appear from the PoC
```
5 Compare REST: `diff <(jq .rest poc-evidence-anon-before.json) <(jq .rest poc-evidence-anon-after.json)` and the same for customer.

### 3.2 Tests, expected results, and the exact evidence to record
| ID | Procedure | Expected (to be confirmed or refuted by the owner's run) | Evidence that MUST be recorded |
|---|---|---|---|
| T1 | sender (role under test, `self:true`) and 1–2 independent observers join `poc:marketplace:v1` | all `SUBSCRIBED` | full status transcript with timestamps for every client (`statuses[]`), role of each client, join error text if any |
| T2 | owner runs `realtime.send` with nonce C1 on `poc:marketplace:v1` | C1 delivered to sender AND every observer within 90 s | C1, `owner_sent_at` from SQL, per-client receive timestamps from `log[]`, owner's SQL result screenshot/text |
| T3 | sender attempts to publish nonce N3 via (a) WebSocket `channel.send`, (b) HTTP `POST /realtime/v1/api/broadcast`; observe 15 s; owner then sends control C2 | sender status `error` or `timed out` (not `ok`); HTTP call rejected (4xx); N3 and N3h absent from sender (server echo) and from every observer; C1 and C2 present everywhere | exact return value of `send()` (verbatim string), HTTP status and body text, complete `log[]` of sender and every observer for the whole test, nonces N3/N3h/C1/C2, C2 receive times, optional informational `select count(*) from realtime.messages where payload->>'nonce' in ('<N3>','<N3h>')` |
| T3 verdict rule | | PASS only if non-delivery AND sender status in {error, timed out} AND controls delivered. Non-delivery with sender status `ok` = INCONCLUSIVE (acked-without-delivery; investigate, not accepted as proof). Any delivery = FAIL. Missing controls = INCONCLUSIVE | |
| T4 | (a) role joins `poc:other` (no policy); if it unexpectedly reports `SUBSCRIBED`, owner sends N4 to `poc:other` and delivery is checked; (b) sender already joined ONLY to `poc:marketplace:v1`; owner sends N4c to `poc:other`; the allowed-topic channels must not receive it; (c) joins to `poc:auth-only` and to variants `poc:marketplace:v1␠`, `poc:marketplace:v10`, `POC:MARKETPLACE:V1`, `poc:marketplace:v1:x`, `poc:user:<own uid>`, `poc:user:1111...` | every join to a no-policy topic or variant refused (`CHANNEL_ERROR`/`TIMED_OUT`/unauthorized), or if joined then nothing delivered; N4 and N4c never delivered anywhere; positive control C1 delivered | join status transcript and error text per topic (verbatim), nonces N4/N4c with owner timestamps, full `log[]` of the unauthorized channel, of the sender's allowed channel and of every observer, list of topics that reported `SUBSCRIBED` (should be exactly `poc:marketplace:v1`) |
| T4 verdict rule | | FAIL on any delivery or cross-topic leak. A join reporting `SUBSCRIBED` on an unauthorized topic with no delivery = INCONCLUSIVE (record, investigate). PASS only with all joins refused, no delivery, controls present | |
| T5 | sender calls `track()` (presence) | not `ok` | verbatim return value |
| T6 | REST `select=id&limit=1` on trips, bookings, customers, tickets and `realtime.messages` (profile header) with the anon key, then with the customer token, BEFORE and AFTER the policy | identical before/after for each role (status, row count, error code) | `rest` block of each JSON; the `diff` output; counts and codes only (script stores no row bodies) |
| T7 | parity of authenticated customer vs anon | see §3.3 | both evidence files |
| Fingerprints | 1c before vs after | byte-identical | both outputs |
| P0, 1a, 1b | see steps | probe visible in logs; no stop condition hit; signature recorded | outputs |

### 3.3 Parity rule (customer must not exceed anon) — T7
For every test id: (customer verdict) must equal (anon verdict) or be stricter. Concretely, compare the two evidence files and require ALL of:
1. The set of topics that reported `SUBSCRIBED` for the customer is a subset of the anon set (expected: both exactly `{poc:marketplace:v1}`).
2. No delivery to the customer that the anon client did not also receive; no customer-only delivery on any variant or per-user topic (`poc:user:<own uid>` must be refused for the customer too).
3. T3 and T5 outcomes identical or stricter (customer never gets `ok` where anon got an error).
4. T6 REST snapshot for the customer shows no more access after the policy than before, and trips/bookings/customers/tickets responses contain no rows beyond what the customer's own RLS allowed before.
Customer allowed to do LESS than anon (e.g. join refused) is recorded as a finding but not a failure of this rule. Any customer privilege beyond anon = FAIL.

## 4. PoC safety review
| Operation | Can it touch non-PoC topics or business data? | Control |
|---|---|---|
| `create policy poc_receive_one_topic ... for select` on `realtime.messages` | It applies to all private-channel authorization in the project, but permissive policies only ADD access, and this one matches exactly `poc:marketplace:v1`. It cannot remove or narrow existing access, and touches no business table | stop condition on broad pre-existing policies (§2); `to anon, authenticated` is deliberate so parity can be tested; no write policies exist |
| `realtime.send` from the SQL editor | Only to topics named in the printed SQL: `poc:marketplace:v1` or `poc:other`; never `marketplace:v1`; inserts rows into `realtime.messages` (platform table) | topic names fixed by the script; owner copies only the printed lines |
| Script client side | subscribes/listens/tries to publish only on `poc:*` topics; presence only on the allowed PoC topic; sign-in of the customer test account creates an Auth session (normal login side effect on staging) | refuses production ref and non-publishable keys; no service key anywhere |
| REST probes | read-only GETs with `select=id&limit=1`, subject to existing RLS; if the customer account has no data, 0 rows; the script keeps counts and codes only, never row bodies | `select=id`, no bodies stored |
| Any write to business tables, grants, RLS flags, other policies, Realtime settings | none | explicitly out of scope; fingerprints prove it after the fact |
Residual risks: (1) if staging shares a Realtime project with another environment, `poc:*` topics could appear there; use a dedicated staging project. (2) If the project's "public access" setting is on, public (non-private) channels exist and a public channel named `poc:...` is outside this policy's scope; the PoC only uses `private:true`. (3) The HTTP broadcast endpoint shape is unverified; a 404 makes T3(b) INCONCLUSIVE, not PASS.

## 5. Cleanup (staging write, owner) — narrowly scoped
```sql
-- 1) remove the policy (this is the only structural change)
drop policy if exists poc_receive_one_topic on realtime.messages;
-- 2) preview the test messages with the SAME predicate you will delete; every row must be one of the owner-sent PoC events
select topic, count(*) from realtime.messages
 where topic in ('poc:marketplace:v1','poc:other','poc:auth-only') and inserted_at >= '<poc_start_utc>' group by topic;
-- 3) optional, only if the preview shows nothing but PoC rows and you hold the privilege (otherwise skip: Realtime retention removes them)
delete from realtime.messages
 where topic in ('poc:marketplace:v1','poc:other','poc:auth-only') and inserted_at >= '<poc_start_utc>';
```
No `LIKE 'poc:%'` wildcard, no unbounded delete, no deletion of anything outside the three exact topic names and the PoC time window. Then re-run step 1a policy list: it must equal the baseline (no `poc_*`). Sign the customer test account out; keep or delete the account per owner policy. If step 1 (drop policy) fails, STOP and do not run anything else.
Expected messages created by the PoC per full run (anon + customer): about 4 owner-sent events per role (C1, C2, N4 if joined, N4c) plus any rejected client publishes; use this to sanity-check the preview count.

## 6. Result log — EXPECTED and ACTUAL are separate. Leave Actual blank until real evidence exists
| ID | Expected | Actual (anon) | Actual (customer) | Evidence files | Verdict |
|---|---|---|---|---|---|
| P0 log probe visible | warning line appears in Postgres logs | NOT RUN | NOT RUN | | |
| 1a stop conditions clear | RLS on; no broad policy; `realtime.send` present | NOT RUN | NOT RUN | | |
| T1 | all SUBSCRIBED | NOT RUN | NOT RUN | | |
| T2 | C1 delivered to all | NOT RUN | NOT RUN | | |
| T3 | rejected + not delivered, controls present | NOT RUN | NOT RUN | | |
| T4 | refused/not delivered, no cross-topic leak | NOT RUN | NOT RUN | | |
| T5 | presence not ok | NOT RUN | NOT RUN | | |
| T6 | REST snapshots identical before/after | NOT RUN | NOT RUN | | |
| T7 parity | customer <= anon | n/a | NOT RUN | | |
| Fingerprints | identical to baseline | NOT RUN | | | |
| Cleanup | policy gone; baseline policy list restored | NOT RUN | | | |
OVERALL STATUS: NOT RUN. Realtime private-channel security is UNPROVEN. No implementation may rely on it until this table is filled from a real staging project.
