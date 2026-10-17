-- 0003: transport, customers, bookings, website, communication (15 tables).
-- Every table: company_id NOT NULL + UNIQUE (company_id, id) on parents -> composite FKs.
set search_path = public, extensions;

create table routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  code text,
  origin_name text not null,
  destination_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, id)
);
create index routes_company_idx on routes(company_id) where deleted_at is null;
create unique index routes_code_uq on routes(company_id, code) where code is not null and deleted_at is null;

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  route_id uuid not null,
  name text not null,
  address text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  stop_order smallint not null check (stop_order >= 1),
  stop_type text not null default 'both' check (stop_type in ('pickup','dropoff','both')),
  offset_minutes smallint not null default 0 check (offset_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint route_stops_route_fk foreign key (company_id, route_id) references routes(company_id, id) on delete cascade,
  constraint route_stops_order_uq unique (route_id, stop_order) deferrable initially deferred,
  constraint route_stops_coords_both_or_neither check ((latitude is null) = (longitude is null))
);
create index route_stops_route_idx on route_stops(company_id, route_id);

create table buses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  plate_number text not null,
  name text,
  capacity smallint not null check (capacity between 1 and 100),
  make text,
  model text,
  year smallint check (year is null or year between 1950 and 2100),
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, plate_number)
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  user_id uuid references profiles(id) on delete set null,
  full_name text not null,
  phone text not null,
  license_number text,
  license_expiry date,
  photo_media_id uuid,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint drivers_photo_fk foreign key (company_id, photo_media_id) references media(company_id, id) on delete set null (photo_media_id)
);
create unique index drivers_user_uq on drivers(company_id, user_id) where user_id is not null;
create index drivers_user_idx on drivers(user_id) where user_id is not null;
create index drivers_photo_idx on drivers(company_id, photo_media_id) where photo_media_id is not null;

create table trip_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  name text not null,
  route_id uuid not null,
  bus_id uuid,
  driver_id uuid,
  departure_time time not null,
  duration_minutes smallint not null check (duration_minutes > 0),
  days_of_week smallint[] not null,
  start_date date not null,
  end_date date,
  price numeric(12,2) not null check (price >= 0),
  capacity smallint not null check (capacity > 0),
  is_active boolean not null default true,
  generated_through date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint trip_templates_route_fk foreign key (company_id, route_id) references routes(company_id, id) on delete restrict,
  constraint trip_templates_bus_fk foreign key (company_id, bus_id) references buses(company_id, id) on delete restrict,
  constraint trip_templates_driver_fk foreign key (company_id, driver_id) references drivers(company_id, id) on delete restrict,
  constraint trip_templates_days_valid check (cardinality(days_of_week) > 0 and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint trip_templates_dates_valid check (end_date is null or end_date >= start_date)
);
create index trip_templates_route_idx on trip_templates(company_id, route_id);
create index trip_templates_bus_idx on trip_templates(company_id, bus_id) where bus_id is not null;
create index trip_templates_driver_idx on trip_templates(company_id, driver_id) where driver_id is not null;

create table trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  route_id uuid not null,
  bus_id uuid,
  driver_id uuid,
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  buffer_minutes smallint not null check (buffer_minutes >= 0),   -- snapshot, set by trigger
  blocked_until timestamptz not null,                             -- arrival_at + buffer, set by trigger
  template_id uuid,
  price numeric(12,2) not null check (price >= 0),
  capacity smallint not null check (capacity > 0),
  seats_booked smallint not null default 0,
  status text not null default 'draft' check (status in ('draft','scheduled','boarding','in_progress','completed','cancelled')),
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint trips_route_fk foreign key (company_id, route_id) references routes(company_id, id) on delete restrict,
  constraint trips_bus_fk foreign key (company_id, bus_id) references buses(company_id, id) on delete restrict,
  constraint trips_driver_fk foreign key (company_id, driver_id) references drivers(company_id, id) on delete restrict,
  constraint trips_template_fk foreign key (company_id, template_id) references trip_templates(company_id, id) on delete set null (template_id),
  constraint trips_times_valid check (arrival_at > departure_at),
  constraint trips_blocked_valid check (blocked_until >= arrival_at),
  constraint trips_seats_valid check (seats_booked between 0 and capacity),
  constraint trips_assigned_when_live check (status = 'draft' or (bus_id is not null and driver_id is not null)),
  constraint trips_bus_no_overlap exclude using gist (
    bus_id with =, tstzrange(departure_at, blocked_until) with &&
  ) where (bus_id is not null and status not in ('draft','cancelled')),
  constraint trips_driver_no_overlap exclude using gist (
    driver_id with =, tstzrange(departure_at, blocked_until) with &&
  ) where (driver_id is not null and status not in ('draft','cancelled'))
);
create unique index trips_template_departure_uq on trips(template_id, departure_at) where template_id is not null;
create index trips_company_departure_idx on trips(company_id, departure_at);
create index trips_public_search_idx on trips(company_id, route_id, departure_at) where status = 'scheduled';
create index trips_route_idx on trips(company_id, route_id);
create index trips_bus_idx on trips(bus_id);
create index trips_driver_idx on trips(driver_id, departure_at);
create index trips_template_idx on trips(template_id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  full_name text not null,
  phone text not null,
  email citext,
  university text,
  student_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, id)
);
create unique index customers_phone_uq on customers(company_id, phone) where deleted_at is null;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  reference text not null,
  trip_id uuid not null,
  customer_id uuid not null,
  pickup_stop_id uuid,
  dropoff_stop_id uuid,
  seats_count smallint not null check (seats_count > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_amount numeric(12,2) not null,
  currency char(3) not null,
  status text not null check (status in ('pending','confirmed','cancelled','completed','no_show')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','refunded')),
  source text not null check (source in ('web','staff')),
  idempotency_key text,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references profiles(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, reference),
  constraint bookings_trip_fk foreign key (company_id, trip_id) references trips(company_id, id) on delete restrict,
  constraint bookings_customer_fk foreign key (company_id, customer_id) references customers(company_id, id) on delete restrict,
  constraint bookings_pickup_fk foreign key (company_id, pickup_stop_id) references route_stops(company_id, id) on delete restrict,
  constraint bookings_dropoff_fk foreign key (company_id, dropoff_stop_id) references route_stops(company_id, id) on delete restrict,
  constraint bookings_total_matches check (total_amount = unit_price * seats_count),
  constraint bookings_cancel_has_timestamp check (status <> 'cancelled' or cancelled_at is not null)
);
create unique index bookings_idempotency_uq on bookings(company_id, idempotency_key) where idempotency_key is not null;
create index bookings_trip_idx on bookings(company_id, trip_id);
create index bookings_customer_idx on bookings(company_id, customer_id);
create index bookings_created_idx on bookings(company_id, created_at desc);
create index bookings_status_idx on bookings(company_id, status);
create index bookings_pickup_idx on bookings(company_id, pickup_stop_id) where pickup_stop_id is not null;
create index bookings_dropoff_idx on bookings(company_id, dropoff_stop_id) where dropoff_stop_id is not null;

-- Schema ready for online payment (Q3). Unused by V1 code.
create table booking_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  booking_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  method text not null check (method in ('cash','card','wallet','bank_transfer','other')),
  status text not null check (status in ('pending','succeeded','failed','refunded')),
  provider text,
  provider_payment_id text,
  recorded_by uuid references profiles(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_payments_booking_fk foreign key (company_id, booking_id) references bookings(company_id, id) on delete restrict
);
create unique index booking_payments_provider_uq on booking_payments(provider, provider_payment_id) where provider_payment_id is not null;
create index booking_payments_booking_idx on booking_payments(company_id, booking_id);

create table website_settings (
  company_id uuid primary key references companies(id) on delete restrict,
  is_published boolean not null default false,
  site_title jsonb,
  meta_description jsonb,
  logo_media_id uuid,
  favicon_media_id uuid,
  primary_color text not null default '#1d4ed8' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#0f172a' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  font_heading text not null default 'cairo',
  font_body text not null default 'cairo',
  contact_email text,
  contact_phone text,
  contact_whatsapp text,
  contact_address jsonb,
  social_links jsonb not null default '{}'::jsonb,
  footer_text jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_settings_logo_fk foreign key (company_id, logo_media_id) references media(company_id, id) on delete set null (logo_media_id),
  constraint website_settings_favicon_fk foreign key (company_id, favicon_media_id) references media(company_id, id) on delete set null (favicon_media_id)
);
create index website_settings_logo_idx on website_settings(company_id, logo_media_id) where logo_media_id is not null;
create index website_settings_favicon_idx on website_settings(company_id, favicon_media_id) where favicon_media_id is not null;

create table website_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  slug text not null,
  title jsonb not null,
  is_home boolean not null default false,
  is_published boolean not null default true,
  seo_title jsonb,
  seo_description jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, slug),
  constraint website_pages_slug_format check (slug = '' or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create unique index website_pages_one_home_idx on website_pages(company_id) where is_home;

create table website_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  page_id uuid not null,
  type text not null check (type in ('hero','about','features','routes','trips','faq','contact','footer','rich_text','image')),
  sort_order integer not null,
  is_enabled boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_sections_page_fk foreign key (company_id, page_id) references website_pages(company_id, id) on delete cascade
);
create index website_sections_page_idx on website_sections(page_id, sort_order);
create index website_sections_company_idx on website_sections(company_id);

create table website_publications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  is_current boolean not null default false,
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  note text,
  unique (company_id, version)
);
create unique index website_publications_one_current_idx on website_publications(company_id) where is_current;

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete restrict,       -- NULL = platform default
  key text not null,
  channel text not null check (channel in ('email','in_app','sms','whatsapp')),
  locale text not null default 'en' check (locale in ('ar','en')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index notification_templates_uq on notification_templates(
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key, channel, locale);
create index notification_templates_company_idx on notification_templates(company_id) where company_id is not null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete restrict,        -- NULL = platform notice
  recipient_user_id uuid references profiles(id) on delete cascade,
  recipient_customer_id uuid,
  recipient_address text,
  channel text not null check (channel in ('email','in_app','sms','whatsapp')),
  template_key text,
  subject text,
  body text not null,
  related_entity_type text,
  related_entity_id uuid,
  status text not null default 'pending' check (status in ('pending','sent','delivered','failed','read')),
  attempts smallint not null default 0,
  error text,
  provider_message_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_customer_fk foreign key (company_id, recipient_customer_id) references customers(company_id, id) on delete restrict,
  constraint notifications_has_recipient check (recipient_user_id is not null or recipient_customer_id is not null or recipient_address is not null),
  constraint notifications_customer_needs_company check (recipient_customer_id is null or company_id is not null)
);
create index notifications_inbox_idx on notifications(recipient_user_id, status, created_at desc);
create index notifications_queue_idx on notifications(status, scheduled_at) where status = 'pending';
create index notifications_company_idx on notifications(company_id, created_at desc);
create index notifications_customer_idx on notifications(company_id, recipient_customer_id) where recipient_customer_id is not null;
