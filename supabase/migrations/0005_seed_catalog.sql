-- 0005: global catalog seed (roles, permissions, grants, entitlement keys, PLACEHOLDER plans).
set search_path = public, extensions;

insert into roles (key, name, description) values
  ('owner','Owner','Full access to the company'),
  ('manager','Manager','Operational and management access'),
  ('operations','Operations staff','Routes, trips, buses and drivers'),
  ('booking','Booking staff','Customers and bookings'),
  ('driver','Driver','Only assigned trips');

insert into permissions (key, module) values
  ('routes.read','routes'),('routes.write','routes'),
  ('buses.read','buses'),('buses.write','buses'),
  ('drivers.read','drivers'),('drivers.write','drivers'),
  ('trips.read','trips'),('trips.write','trips'),('trips.read_assigned','trips'),
  ('customers.read','customers'),('customers.write','customers'),
  ('bookings.read','bookings'),('bookings.write','bookings'),
  ('website.read','website'),('website.write','website'),
  ('media.read','media'),('media.write','media'),
  ('users.read','users'),('users.write','users'),
  ('settings.read','settings'),('settings.write','settings'),
  ('domains.read','domains'),('domains.write','domains'),
  ('notifications.read','notifications'),('notifications.write','notifications'),
  ('billing.read','billing'),
  ('audit.read','audit'),
  ('analytics.read','analytics');

-- grants as data: owner = everything
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.key = 'owner';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key not in ('billing.read','users.write','domains.write')
where r.key = 'manager';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key in (
  'routes.read','routes.write','buses.read','buses.write','drivers.read','drivers.write',
  'trips.read','trips.write','bookings.read','settings.read','media.read','media.write','notifications.read')
where r.key = 'operations';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key in (
  'customers.read','customers.write','bookings.read','bookings.write',
  'trips.read','routes.read','settings.read','media.read','notifications.read')
where r.key = 'booking';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'trips.read_assigned'
where r.key = 'driver';

insert into entitlement_definitions (key, value_type, description) values
  ('max_users','integer','Company users'),
  ('max_buses','integer','Buses'),
  ('max_drivers','integer','Drivers'),
  ('max_routes','integer','Active routes'),
  ('max_trips_per_month','integer','Trips per calendar month (enforced in Phase 5)'),
  ('max_bookings_per_month','integer','Bookings per calendar month (enforced in Phase 8)'),
  ('feature_analytics','boolean','Analytics dashboard'),
  ('feature_custom_domain','boolean','Custom domain'),
  ('feature_notifications_sms','boolean','SMS notifications');

-- PLACEHOLDER plans: prices 0 and is_public=false until the owner sets real values.
insert into plans (code, name, price_monthly, is_public, sort_order) values
  ('starter','Starter',0,false,1),
  ('professional','Professional',0,false,2),
  ('enterprise','Enterprise',0,false,3);

insert into plan_entitlements (plan_id, key, int_value, bool_value)
select p.id, v.key, v.int_value, v.bool_value
from plans p join (values
  ('starter','max_users',3,null::boolean),('starter','max_buses',5,null),('starter','max_drivers',5,null),
  ('starter','max_routes',5,null),('starter','max_trips_per_month',200,null),('starter','max_bookings_per_month',2000,null),
  ('starter','feature_analytics',null,false),('starter','feature_custom_domain',null,false),('starter','feature_notifications_sms',null,false),
  ('professional','max_users',10,null),('professional','max_buses',20,null),('professional','max_drivers',20,null),
  ('professional','max_routes',20,null),('professional','max_trips_per_month',1000,null),('professional','max_bookings_per_month',10000,null),
  ('professional','feature_analytics',null,true),('professional','feature_custom_domain',null,true),('professional','feature_notifications_sms',null,false),
  ('enterprise','max_users',null,null),('enterprise','max_buses',null,null),('enterprise','max_drivers',null,null),
  ('enterprise','max_routes',null,null),('enterprise','max_trips_per_month',null,null),('enterprise','max_bookings_per_month',null,null),
  ('enterprise','feature_analytics',null,true),('enterprise','feature_custom_domain',null,true),('enterprise','feature_notifications_sms',null,true)
) as v(code, key, int_value, bool_value) on v.code = p.code;
