-- 0009: phone policy. International numbers, stored as E.164 ("+" + country code + national number, 8-15 digits
-- total is what ITU allows; we accept 7-15 digits after "+", first digit 1-9). Same shape WhatsApp expects.
--
-- Layering:
--   * The app server (zod + libphonenumber-js) parses local formats with the company's country and rejects numbers
--     that are not valid for their country. It is the user-friendly, country-aware layer.
--   * THIS migration is the layer nobody can bypass (raw PostgREST calls, other RPCs, SQL jobs): it cleans
--     formatting noise, converts Arabic-Indic digits and a leading 00 to +, and REJECTS anything that is not E.164.
--     It deliberately does not guess a country: "01012345678" without a country is rejected here, never guessed.
set search_path = public, extensions;

create or replace function app_private.normalize_phone(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  with cleaned as (
    select regexp_replace(
             translate(trim(coalesce(p, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
             '[\s().\-]', '', 'g') as s
  ), prefixed as (
    select case when s like '00%' then '+' || substr(s, 3) else s end as s from cleaned
  )
  select case when s ~ '^\+[1-9][0-9]{6,14}$' then s else null end from prefixed
$$;

create or replace function app_private.normalize_phone_columns() returns trigger
language plpgsql set search_path = '' as $$
declare col text; v text; n text;
begin
  foreach col in array tg_argv loop
    v := to_jsonb(new) ->> col;
    if v is not null then
      n := app_private.normalize_phone(v);
      if n is null then
        raise exception 'invalid phone number: must be international format (E.164), for example +201012345678'
          using errcode = '22023';
      end if;
      if n is distinct from v then new := jsonb_populate_record(new, jsonb_build_object(col, n)); end if;
    end if;
  end loop;
  return new;
end $$;

-- Best-effort backfill of rows written before this policy. Egypt-only convenience, and ONLY for companies whose
-- country is EG: 01xxxxxxxxx -> +201xxxxxxxxx. Anything else that is not already E.164 is left untouched and
-- reported; the constraints below are NOT VALID so old rows never block the migration.
create or replace function pg_temp.backfill(p_table text, p_col text, p_company_expr text) returns void
language plpgsql as $f$
declare r record; n text; fixed int := 0; skipped int := 0;
begin
  for r in execute format('select t.ctid::text as id, t.%1$I as phone, c.country from public.%2$I t left join public.companies c on c.id = %3$s where t.%1$I is not null', p_col, p_table, p_company_expr)
  loop
    n := app_private.normalize_phone(r.phone);
    if n is null and r.country = 'EG' and regexp_replace(r.phone, '[\s().\-]', '', 'g') ~ '^0?1[0125][0-9]{8}$' then
      n := '+20' || regexp_replace(regexp_replace(r.phone, '[\s().\-]', '', 'g'), '^0', '');
    end if;
    if n is null then skipped := skipped + 1; continue; end if;
    if n is distinct from r.phone then
      begin
        execute format('update public.%I set %I = $1 where ctid = $2::tid', p_table, p_col) using n, r.id;
        fixed := fixed + 1;
      exception when unique_violation then skipped := skipped + 1;
      end;
    end if;
  end loop;
  raise notice 'phone backfill %.%: normalised %, left as-is %', p_table, p_col, fixed, skipped;
end $f$;
select pg_temp.backfill('customers', 'phone', 't.company_id');
select pg_temp.backfill('drivers', 'phone', 't.company_id');
select pg_temp.backfill('companies', 'contact_phone', 't.id');
select pg_temp.backfill('website_settings', 'contact_phone', 't.company_id');
select pg_temp.backfill('website_settings', 'contact_whatsapp', 't.company_id');

-- Triggers (named so they run after the tenant guard and before limit counting) + constraints for new writes.
create trigger "010_normalize_phone" before insert or update of phone on customers
  for each row execute function app_private.normalize_phone_columns('phone');
create trigger "010_normalize_phone" before insert or update of phone on drivers
  for each row execute function app_private.normalize_phone_columns('phone');
create trigger "010_normalize_phone" before insert or update of phone on profiles
  for each row execute function app_private.normalize_phone_columns('phone');
create trigger "010_normalize_phone" before insert or update of contact_phone on companies
  for each row execute function app_private.normalize_phone_columns('contact_phone');
create trigger "010_normalize_phone" before insert or update of contact_phone, contact_whatsapp on website_settings
  for each row execute function app_private.normalize_phone_columns('contact_phone', 'contact_whatsapp');

alter table customers add constraint customers_phone_e164 check (phone ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table drivers add constraint drivers_phone_e164 check (phone ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table profiles add constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table companies add constraint companies_contact_phone_e164 check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table website_settings add constraint website_settings_phones_e164 check (
  (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$') and (contact_whatsapp is null or contact_whatsapp ~ '^\+[1-9][0-9]{6,14}$')) not valid;

-- Validate what we can; a table that still holds legacy non-E.164 rows stays NOT VALID (new writes are still checked).
do $v$
declare c record;
begin
  for c in select conrelid::regclass::text as tbl, conname from pg_constraint where conname in
    ('customers_phone_e164','drivers_phone_e164','profiles_phone_e164','companies_contact_phone_e164','website_settings_phones_e164')
  loop
    begin execute format('alter table %s validate constraint %I', c.tbl, c.conname);
    exception when check_violation then raise notice 'constraint % left NOT VALID: legacy rows need manual clean-up', c.conname;
    end;
  end loop;
end $v$;
