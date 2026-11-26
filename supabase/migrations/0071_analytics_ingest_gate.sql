-- 0071_analytics_ingest_gate.sql  (P10: ingest without a service-role key)
--
-- WHY: 0068 granted the ingest RPCs to service_role only, which would need a service-role key in the Next.js route. Project rule: no service-role keys.
-- HOW: three thin public wrappers callable by anon/authenticated. Each needs an HMAC token signed by the Next.js route with ANALYTICS_INGEST_SECRET
--   (a server-only secret, also stored in the database by set_analytics_ingest_secret, super_admin only). The token binds: which call, session id, user id,
--   company id (and the consent value) plus a short expiry. The anon key is public, so a caller going straight to PostgREST has no secret and is refused.
--   The inner functions (track_events, track_search, record_consent) stay service_role-only and are reached only through the wrappers.
-- LIMITS (stated): the token binds identity and call but NOT the payload (jsonb has no canonical text a client can reproduce), and it is not single-use
--   (60 s expiry). Whoever holds a live token, i.e. the app server, could replay it with another payload within 60 s. Per-session and per-IP-hash rate limits
--   and the strict catalogue validation inside the inner functions still apply. The secret never reaches the browser.
-- Rollback: drop function public.ingest_events(text,uuid,uuid,jsonb,jsonb,bigint,text), public.ingest_search(text,uuid,uuid,jsonb,jsonb,bigint,text),
--   public.ingest_consent(text,uuid,boolean,text,bigint,text), public.set_analytics_ingest_secret(text), app_private.analytics_check_token(text,text,uuid,uuid,bigint,text);
--   alter table app_private.analytics_config drop column ingest_secret.
-- Runner note: needs 0057 (app_private.hmac_sha256) and 0068. Apply BEFORE deploying the route; then run set_analytics_ingest_secret('<same value as ANALYTICS_INGEST_SECRET>').

alter table app_private.analytics_config add column ingest_secret text check (ingest_secret is null or length(ingest_secret) >= 32);

create function app_private.analytics_check_token(p_call text, p_session text, p_user uuid, p_company uuid, p_exp bigint, p_sig text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret text; v_now bigint := extract(epoch from now())::bigint;
begin
  select ingest_secret into v_secret from app_private.analytics_config;
  if v_secret is null then raise exception 'ingest not configured' using errcode = '42501'; end if;
  if p_exp is null or p_exp < v_now or p_exp > v_now + 120 or p_sig is null or p_sig !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token' using errcode = '42501';
  end if;
  if app_private.hmac_sha256(v_secret, 'v1|' || p_call || '|' || coalesce(p_session, '') || '|' || coalesce(p_user::text, '') || '|' || coalesce(p_company::text, '') || '|' || p_exp) is distinct from p_sig then
    raise exception 'invalid token' using errcode = '42501';
  end if;
end $$;
revoke all on function app_private.analytics_check_token(text, text, uuid, uuid, bigint, text) from public, anon, authenticated;

create function public.ingest_events(p_session text, p_user uuid, p_company uuid, p_events jsonb, p_ctx jsonb, p_exp bigint, p_sig text)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.analytics_check_token('events', p_session, p_user, p_company, p_exp, p_sig);
  return public.track_events(p_session, p_user, p_company, p_events, p_ctx);
end $$;

create function public.ingest_search(p_session text, p_user uuid, p_company uuid, p_search jsonb, p_ctx jsonb, p_exp bigint, p_sig text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.analytics_check_token('search', p_session, p_user, p_company, p_exp, p_sig);
  return public.track_search(p_session, p_user, p_company, p_search, p_ctx);
end $$;

-- the consent value is part of the signed call name, so a token for "granted" cannot be used to record "denied" or the reverse
create function public.ingest_consent(p_session text, p_user uuid, p_granted boolean, p_version text, p_exp bigint, p_sig text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.analytics_check_token('consent:' || coalesce(p_granted::text, ''), p_session, p_user, null, p_exp, p_sig);
  perform public.record_consent(p_session, p_user, p_granted, p_version);
end $$;

revoke all on function public.ingest_events(text,uuid,uuid,jsonb,jsonb,bigint,text), public.ingest_search(text,uuid,uuid,jsonb,jsonb,bigint,text),
  public.ingest_consent(text,uuid,boolean,text,bigint,text) from public;
grant execute on function public.ingest_events(text,uuid,uuid,jsonb,jsonb,bigint,text), public.ingest_search(text,uuid,uuid,jsonb,jsonb,bigint,text),
  public.ingest_consent(text,uuid,boolean,text,bigint,text) to anon, authenticated;

create function public.set_analytics_ingest_secret(p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_secret is null or length(p_secret) < 32 then raise exception 'secret too short' using errcode = '22023'; end if;
  update app_private.analytics_config set ingest_secret = p_secret;
  perform app_private.write_audit('platform_user', null, 'analytics.ingest_secret_changed', 'analytics', null, '{}'::jsonb);
end $$;
revoke all on function public.set_analytics_ingest_secret(text) from public, anon;
grant execute on function public.set_analytics_ingest_secret(text) to authenticated;
