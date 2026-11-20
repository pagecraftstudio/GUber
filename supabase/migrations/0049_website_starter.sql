-- 0049 (W2): starter website for the setup wizard. One idempotent RPC; nothing it creates is public (a publication is still required).
--
-- RULES
--   * Company comes from the caller (website.write). No company argument. Serialised per company by the company-row lock, so two
--     tabs opening the wizard at once cannot create two home pages or seed the sections twice.
--   * Creates only what is MISSING and never overwrites: the website_settings row, the site title (only when empty), the home page
--     (published flag on, as the publish checklist requires), and the starter sections (hero, about, routes, trips, contact) when
--     the home page has NO sections and the site was NEVER published. After a first publication, an empty home page is the
--     owner's choice and is left alone.
--   * Starter text is bilingual (ar + en). The company name is used as the site title and hero title; angle brackets are stripped
--     from it because 0046 refuses raw HTML in site content.
--   * Same validators as any other write: the 0046 triggers fire on every insert here.
--   * Returns {"created_home": bool, "seeded_sections": int, "created_settings": bool} so the UI can tell a first visit from a return.
--
-- ROLLBACK:  drop function public.ensure_starter_site();
-- RUNNER NOTE: requires 0045 (caller_company) and 0046.
set search_path = public, extensions;

create or replace function public.ensure_starter_site() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_co uuid; v_name text; v_home uuid; v_made_settings boolean := false; v_made_home boolean := false; v_seeded integer := 0;
begin
  v_co := app_private.caller_company('website.write');
  perform 1 from public.companies where id = v_co for update;
  select trim(regexp_replace(c.name, '[<>]', '', 'g')) into v_name from public.companies c where c.id = v_co;
  if v_name is null or v_name = '' then v_name := 'Our company'; end if;

  insert into public.website_settings (company_id, site_title)
  values (v_co, jsonb_build_object('en', v_name, 'ar', v_name))
  on conflict (company_id) do nothing;
  get diagnostics v_seeded = row_count;
  v_made_settings := v_seeded > 0;
  v_seeded := 0;
  update public.website_settings set site_title = jsonb_build_object('en', v_name, 'ar', v_name)
   where company_id = v_co and (site_title is null or site_title = '{}'::jsonb
         or coalesce(nullif(trim(site_title->>'en'), ''), nullif(trim(site_title->>'ar'), '')) is null);

  select id into v_home from public.website_pages where company_id = v_co and is_home;
  if v_home is null then
    insert into public.website_pages (company_id, slug, title, is_home, is_published)
    values (v_co, '', jsonb_build_object('en', 'Home', 'ar', 'الرئيسية'), true, true) returning id into v_home;
    v_made_home := true;
  end if;

  if not exists (select 1 from public.website_sections where company_id = v_co and page_id = v_home)
     and not exists (select 1 from public.website_publications where company_id = v_co) then
    insert into public.website_sections (company_id, page_id, type, sort_order, content) values
      (v_co, v_home, 'hero', 1, jsonb_build_object(
        'title', jsonb_build_object('en', v_name, 'ar', v_name),
        'subtitle', jsonb_build_object('en', 'Safe, on-time university bus transport.', 'ar', 'نقل جامعي آمن وفي الموعد.'),
        'cta_label', jsonb_build_object('en', 'See trips', 'ar', 'شاهد الرحلات'),
        'cta_href', '#trips')),
      (v_co, v_home, 'routes', 2, jsonb_build_object('title', jsonb_build_object('en', 'Our routes', 'ar', 'خطوطنا'))),
      (v_co, v_home, 'trips', 3, jsonb_build_object('title', jsonb_build_object('en', 'Upcoming trips', 'ar', 'الرحلات القادمة'), 'limit', 10)),
      (v_co, v_home, 'about', 4, jsonb_build_object(
        'title', jsonb_build_object('en', 'About us', 'ar', 'من نحن'),
        'body', jsonb_build_object('en', 'Tell students and parents who you are, which campuses you serve and how booking works.',
                                   'ar', 'عرّف الطلاب وأولياء الأمور بشركتك، والجامعات التي تخدمها، وكيفية الحجز.'))),
      (v_co, v_home, 'contact', 5, jsonb_build_object('title', jsonb_build_object('en', 'Contact us', 'ar', 'تواصل معنا')));
    get diagnostics v_seeded = row_count;
  end if;

  return jsonb_build_object('created_home', v_made_home, 'seeded_sections', v_seeded, 'created_settings', v_made_settings);
end $$;
revoke all on function public.ensure_starter_site() from public, anon;
grant execute on function public.ensure_starter_site() to authenticated;
