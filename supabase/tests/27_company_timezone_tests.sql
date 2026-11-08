-- 27: company_timezone (0031). Requires 01 fixtures.
select t.as_admin();
update company_settings set timezone = 'Africa/Cairo' where company_id = t.u(101);
select t.as_user(t.u(2));
select t.eq('staff of A reads A time zone', public.company_timezone(t.u(101)), 'Africa/Cairo');
select t.raises('company A user cannot read company B time zone', format('select public.company_timezone(%L)', t.u(102)), 'P0002');
select t.as_user(t.u(7));
select t.raises('company B user cannot read company A time zone', format('select public.company_timezone(%L)', t.u(101)), 'P0002');
select t.as_anon();
select t.raises('anonymous cannot call it', format('select public.company_timezone(%L)', t.u(101)), '42501');
