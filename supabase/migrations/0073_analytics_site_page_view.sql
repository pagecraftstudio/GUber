-- 0073_analytics_site_page_view.sql  (P10: company-site page views, data only, no schema change)
-- WHY: 'page_view' is a marketplace event (catalog surface 'marketplace', and the admin overview counts exactly that name). A visit to a company's
--   own public site needs its own event so it carries surface 'company_site' and never inflates marketplace numbers. company_id comes from the server (api/track), never the client.
-- Rollback: delete from public.analytics_event_catalog where event = 'site_page_view';
-- Runner note: needs 0068. Apply before deploying client code that sends it (unknown events are rejected by track_events).
-- Mirror: src/lib/analytics/events.ts (EVENT_KEYS). Change both together.
insert into public.analytics_event_catalog (event, surface, allowed_keys) values
  ('site_page_view', 'company_site', '{}')
on conflict (event) do nothing;
