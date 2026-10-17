-- 0002: identity, authorization catalog, platform, billing, audit (19 tables, incl. media).
set search_path = public, extensions;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text not null,
  phone text,
  avatar_media_id uuid,                       -- FK added in 0003 after media exists
  locale text not null default 'ar' check (locale in ('ar','en')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_users (
  user_id uuid primary key references profiles(id) on delete cascade,
  role text not null check (role in ('super_admin','support','billing')),
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  module text not null,
  description text,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);
create index role_permissions_permission_idx on role_permissions(permission_id);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  legal_name text,
  tax_number text,
  contact_email citext,
  contact_phone text,
  country char(2),
  suspended_at timestamptz,
  suspension_reason text,                     -- platform-only: tenants have NO policy on this table
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- citext regex match is case-insensitive, so lower-case is checked explicitly
  constraint companies_slug_format check (
    slug::text = lower(slug::text)
    and slug::text ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
  ),
  constraint companies_slug_not_reserved check (
    slug::text not in ('www','admin','api','app','mail','support','static','assets','cdn','dashboard','platform','status','blog','docs')
  ),
  constraint companies_suspension_consistent check (status <> 'suspended' or suspended_at is not null)
);
create index companies_status_idx on companies(status);

create table media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  kind text not null check (kind in ('logo','favicon','website_image','driver_photo','bus_document','avatar','other')),
  bucket text not null check (bucket in ('company-public','company-private')),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon','image/vnd.microsoft.icon','application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, id),
  unique (bucket, storage_path),
  constraint media_path_in_tenant_folder check (storage_path like company_id::text || '/%'),
  constraint media_path_no_traversal check (storage_path !~ '(^|/)\.\.(/|$)')
);
create index media_company_kind_idx on media(company_id, kind);

create table company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  user_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended')),
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, id),
  -- V1 rule (Q8): one company per user. Deliberate and removable: drop this constraint.
  constraint company_users_one_company_per_user unique (user_id)
);
create index company_users_role_idx on company_users(company_id, role_id);
create index company_users_role_id_idx on company_users(role_id);

create table company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  email citext not null,
  role_id uuid not null references roles(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  invited_by uuid references profiles(id) on delete set null,
  accepted_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index company_invites_one_pending_idx on company_invites(company_id, email) where status = 'pending';
create index company_invites_company_status_idx on company_invites(company_id, status);
create index company_invites_role_id_idx on company_invites(role_id);

create table company_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index company_notes_company_idx on company_notes(company_id, created_at desc);

create table company_settings (
  company_id uuid primary key references companies(id) on delete restrict,
  timezone text not null default 'Africa/Cairo',
  currency char(3) not null default 'EGP',
  default_locale text not null default 'ar',
  supported_locales text[] not null default '{ar,en}',
  booking_enabled boolean not null default true,
  allow_guest_booking boolean not null default true,
  booking_cutoff_minutes integer not null default 60 check (booking_cutoff_minutes >= 0),
  cancellation_window_hours integer not null default 24 check (cancellation_window_hours >= 0),
  max_seats_per_booking smallint not null default 4 check (max_seats_per_booking between 1 and 50),
  trip_buffer_minutes smallint not null default 30 check (trip_buffer_minutes between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_settings_locales_valid check (
    cardinality(supported_locales) > 0
    and supported_locales <@ array['ar','en']
    and default_locale = any (supported_locales)
  )
);

create table domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  hostname citext not null unique,
  kind text not null check (kind in ('platform_subdomain','custom')),
  is_primary boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  verification_token text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domains_hostname_format check (
    hostname::text = lower(hostname::text)
    and hostname::text ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
  ),
  constraint domains_verified_has_timestamp check (verification_status <> 'verified' or verified_at is not null)
);
create unique index domains_one_primary_idx on domains(company_id) where is_primary;
create index domains_company_idx on domains(company_id);

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly numeric(12,2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(12,2) check (price_yearly is null or price_yearly >= 0),
  currency char(3) not null default 'EGP',
  trial_days integer not null default 14 check (trial_days >= 0),
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entitlement_definitions (
  key text primary key,
  value_type text not null check (value_type in ('integer','boolean')),
  description text
);

create table plan_entitlements (
  plan_id uuid not null references plans(id) on delete cascade,
  key text not null references entitlement_definitions(key) on delete restrict,
  int_value integer check (int_value is null or int_value >= 0),   -- NULL on an integer key = unlimited
  bool_value boolean,
  primary key (plan_id, key),
  constraint plan_entitlements_one_value check (not (int_value is not null and bool_value is not null))
);
create index plan_entitlements_key_idx on plan_entitlements(key);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  plan_id uuid not null references plans(id) on delete restrict,
  status text not null check (status in ('trialing','active','past_due','cancelled','expired')),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_valid check (current_period_end > current_period_start)
);
create unique index subscriptions_one_live_idx on subscriptions(company_id) where status in ('trialing','active','past_due');
create index subscriptions_company_idx on subscriptions(company_id, created_at desc);
create index subscriptions_expiry_idx on subscriptions(status, current_period_end);
create index subscriptions_plan_idx on subscriptions(plan_id);

create sequence invoice_number_seq;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  subscription_id uuid references subscriptions(id) on delete set null,
  invoice_number text not null unique,
  status text not null check (status in ('draft','open','paid','void','uncollectible')),
  currency char(3) not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  total numeric(12,2) not null,
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  provider_invoice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_total_matches check (total = subtotal + tax)
);
create index invoices_company_idx on invoices(company_id, created_at desc);
create index invoices_status_due_idx on invoices(status, due_at);
create index invoices_subscription_idx on invoices(subscription_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict,
  invoice_id uuid not null references invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  status text not null check (status in ('pending','succeeded','failed','refunded')),
  method text,
  provider text,
  provider_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payments_provider_uq on payments(provider, provider_payment_id) where provider_payment_id is not null;
create index payments_company_idx on payments(company_id);
create index payments_invoice_idx on payments(invoice_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('platform_user','company_user','customer','system')),
  company_id uuid references companies(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_company_idx on audit_logs(company_id, created_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs(actor_id, created_at desc);

alter table profiles add constraint profiles_avatar_media_fk
  foreign key (avatar_media_id) references media(id) on delete set null;
create index profiles_avatar_idx on profiles(avatar_media_id) where avatar_media_id is not null;
