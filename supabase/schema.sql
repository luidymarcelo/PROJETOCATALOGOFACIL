create extension if not exists "pgcrypto";

create type store_segment as enum (
  'restaurant',
  'pharmacy',
  'construction',
  'retail',
  'services'
);

create type integration_kind as enum (
  'manual_upload',
  'scheduled_database',
  'external_api',
  'webhook'
);

create type sync_status as enum (
  'pending',
  'running',
  'success',
  'failed'
);

create type order_status as enum (
  'draft',
  'sent_whatsapp',
  'accepted',
  'cancelled',
  'completed'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_name text,
  owner_phone text,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  segment store_segment not null default 'retail',
  whatsapp_phone text not null,
  address text,
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  minimum_order numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  delivery_time_label text,
  cover_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table public.tenant_parameters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parameter_key text not null check (parameter_key ~ '^[a-z][a-z0-9_]*$'),
  parameter_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, parameter_key)
);

create table public.store_parameters (
  store_id uuid not null references public.stores(id) on delete cascade,
  parameter_key text not null check (parameter_key ~ '^[a-z][a-z0-9_]*$'),
  parameter_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (store_id, parameter_key)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  external_id text,
  name text not null,
  description text,
  image_url text,
  price numeric(12, 2) not null,
  compare_at_price numeric(12, 2),
  stock_quantity numeric(12, 3),
  unit text,
  badge text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);

create table public.integration_sources (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kind integration_kind not null,
  name text not null,
  connection_ref text,
  schedule_cron text,
  config jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_source_id uuid not null references public.integration_sources(id) on delete cascade,
  status sync_status not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  products_seen integer not null default 0,
  products_updated integer not null default 0,
  error_message text
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  status order_status not null default 'draft',
  customer_name text,
  customer_phone text,
  delivery_address text,
  payment_method text,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  whatsapp_message text,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null,
  quantity numeric(12, 3) not null,
  total numeric(12, 2) not null
);

create index products_store_active_idx on public.products (store_id, is_active);
create index categories_store_order_idx on public.categories (store_id, sort_order);
create index tenant_parameters_key_idx on public.tenant_parameters (parameter_key);
create index store_parameters_key_idx on public.store_parameters (parameter_key);
create index sync_jobs_source_status_idx on public.sync_jobs (integration_source_id, status);
create index orders_store_created_idx on public.orders (store_id, created_at desc);

create or replace function public.get_public_catalog_companies()
returns table (
  tenant_id uuid,
  company_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name
  from public.tenants t
  where exists (
    select 1
    from public.stores s
    where s.tenant_id = t.id
      and s.is_active
  )
  order by t.name;
$$;

revoke all on function public.get_public_catalog_companies() from public;
grant execute on function public.get_public_catalog_companies() to anon, authenticated;

notify pgrst, 'reload schema';
