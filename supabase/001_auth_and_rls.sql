-- Usuarios e permissoes do Catalogo Facil.
do $$
begin
  create type public.member_role as enum ('owner', 'admin', 'manager', 'staff');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index if not exists tenant_members_user_idx on public.tenant_members (user_id);
create index if not exists store_members_user_idx on public.store_members (user_id);

create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = target_tenant_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_manage_store(target_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.stores s
    left join public.store_members sm on sm.store_id = s.id and sm.user_id = auth.uid()
    where s.id = target_store_id
      and (
        public.is_tenant_admin(s.tenant_id)
        or sm.role in ('owner', 'admin', 'manager', 'staff')
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.tenant_members enable row level security;
alter table public.store_members enable row level security;
alter table public.tenants enable row level security;
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.integration_sources enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "public can read active stores" on public.stores;
drop policy if exists "public can read active categories" on public.categories;
drop policy if exists "public can read active products" on public.products;
drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "members can read their memberships" on public.tenant_members;
drop policy if exists "tenant admins manage memberships" on public.tenant_members;
drop policy if exists "members can read store memberships" on public.store_members;
drop policy if exists "tenant admins manage store memberships" on public.store_members;
drop policy if exists "tenant admins manage stores" on public.stores;
drop policy if exists "store members manage categories" on public.categories;
drop policy if exists "store members manage products" on public.products;
drop policy if exists "store members manage integrations" on public.integration_sources;
drop policy if exists "store members read sync jobs" on public.sync_jobs;
drop policy if exists "public can create orders" on public.orders;
drop policy if exists "store members read orders" on public.orders;
drop policy if exists "public can create order items" on public.order_items;
drop policy if exists "store members read order items" on public.order_items;

create policy "public can read active stores"
  on public.stores for select
  using (is_active = true);

create policy "public can read active categories"
  on public.categories for select
  using (is_active = true);

create policy "public can read active products"
  on public.products for select
  using (is_active = true);

create policy "users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "users can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "members can read their memberships"
  on public.tenant_members for select
  using (user_id = auth.uid() or public.is_tenant_admin(tenant_id));

create policy "tenant admins manage memberships"
  on public.tenant_members for all
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "members can read store memberships"
  on public.store_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.stores s
      where s.id = store_id and public.is_tenant_admin(s.tenant_id)
    )
  );

create policy "tenant admins manage store memberships"
  on public.store_members for all
  using (
    exists (
      select 1 from public.stores s
      where s.id = store_id and public.is_tenant_admin(s.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = store_id and public.is_tenant_admin(s.tenant_id)
    )
  );

create policy "tenant admins manage stores"
  on public.stores for all
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "store members manage categories"
  on public.categories for all
  using (public.can_manage_store(store_id))
  with check (public.can_manage_store(store_id));

create policy "store members manage products"
  on public.products for all
  using (public.can_manage_store(store_id))
  with check (public.can_manage_store(store_id));

create policy "store members manage integrations"
  on public.integration_sources for all
  using (public.can_manage_store(store_id))
  with check (public.can_manage_store(store_id));

create policy "store members read sync jobs"
  on public.sync_jobs for select
  using (
    exists (
      select 1
      from public.integration_sources source
      where source.id = integration_source_id
        and public.can_manage_store(source.store_id)
    )
  );

create policy "public can create orders"
  on public.orders for insert
  with check (exists (select 1 from public.stores s where s.id = store_id and s.is_active = true));

create policy "store members read orders"
  on public.orders for select
  using (public.can_manage_store(store_id));

create policy "public can create order items"
  on public.order_items for insert
  with check (exists (select 1 from public.orders o where o.id = order_id));

create policy "store members read order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.can_manage_store(o.store_id)
    )
  );

-- Permite que o primeiro administrador crie a empresa pelo painel.
create or replace function public.create_tenant_with_owner(
  tenant_name text,
  tenant_slug text,
  owner_name text default null,
  owner_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.tenants (name, slug, owner_name, owner_phone)
  values (tenant_name, tenant_slug, owner_name, owner_phone)
  returning id into new_tenant_id;

  insert into public.profiles (id, full_name, phone)
  values (auth.uid(), owner_name, owner_phone)
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        updated_at = now();

  insert into public.tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'owner');

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text, text, text)
  to authenticated;
