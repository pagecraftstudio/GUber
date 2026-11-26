-- 0069_analytics_event_catalog_v2.sql  (P10b-1: data only, no schema change)
-- Rollback: delete from public.analytics_event_catalog where event in (<the events listed below>);
-- Runner note: needs 0068. Apply before deploying client code that sends these events (unknown events are rejected by track_events).
--
-- Rules for every allowed key: scalar, short, NEVER personal (no names, emails, phones, MASAR IDs, free text, tokens).
-- Ids of trips/plans are not personal. Free-text input is never an event property.
-- Mirror: src/lib/analytics/events.ts (EVENT_KEYS). Change both together.
insert into public.analytics_event_catalog (event, surface, allowed_keys) values
  -- marketplace: discovery + booking funnel
  ('result_click',             'marketplace',  '{position}'),
  ('trip_view',                'marketplace',  '{trip_id}'),
  ('booking_start',            'marketplace',  '{trip_id}'),
  ('booking_step',             'marketplace',  '{trip_id,step}'),
  ('booking_submit',           'marketplace',  '{trip_id}'),
  ('booking_success',          'marketplace',  '{trip_id,free}'),
  ('booking_abandon',          'marketplace',  '{trip_id,step}'),
  ('payment_info_shown',       'marketplace',  '{trip_id}'),
  ('whatsapp_proof_click',     'marketplace',  '{trip_id}'),
  ('sign_in',                  'marketplace',  '{method}'),
  ('sign_up',                  'marketplace',  '{method}'),
  -- company public websites
  ('section_view',             'company_site', '{section}'),
  ('cta_click',                'company_site', '{section,cta}'),
  ('book_click',               'company_site', '{trip_id}'),
  ('contact_click',            'company_site', '{channel}'),
  ('subscription_request_click','company_site','{plan_id}'),
  -- company dashboard (time-to-first-trip/booking and publish events come from table timestamps at rollup, not from the client)
  ('feature_use',              'dashboard',    '{screen,action}'),
  ('ui_error',                 'dashboard',    '{screen,code}'),
  -- driver app
  ('scan_outcome',             'driver',       '{verdict}'),
  ('scan_offline',             'driver',       '{}')
on conflict (event) do nothing;
