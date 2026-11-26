-- 68: P10, company-site page view in the event catalog (migration 0073). Harness style.
select t.as_admin();
delete from t.results where name like 'p10s: %';
select t.eq('p10s: site_page_view is a company_site event with no properties',
  (select surface || '/' || cardinality(allowed_keys)::text || '/' || is_active::text from public.analytics_event_catalog where event = 'site_page_view'), 'company_site/0/true');
select t.eq('p10s: page_view stays a marketplace event',
  (select surface from public.analytics_event_catalog where event = 'page_view'), 'marketplace');
