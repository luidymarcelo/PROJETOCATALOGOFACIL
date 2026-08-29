create table if not exists public.option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections >= 1),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (max_selections >= min_selections),
  unique (store_id, name)
);

create table if not exists public.option_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_option_groups (
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.option_groups(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);

create index if not exists option_groups_store_order_idx on public.option_groups (store_id, sort_order);
create index if not exists option_group_items_group_order_idx on public.option_group_items (group_id, sort_order);
create index if not exists product_option_groups_group_idx on public.product_option_groups (group_id);

alter table public.option_groups enable row level security;
alter table public.option_group_items enable row level security;
alter table public.product_option_groups enable row level security;

drop policy if exists "public can read active option groups" on public.option_groups;
create policy "public can read active option groups"
  on public.option_groups for select
  using (is_active = true);

drop policy if exists "public can read active option items" on public.option_group_items;
create policy "public can read active option items"
  on public.option_group_items for select
  using (
    is_active = true
    and exists (
      select 1 from public.option_groups g
      where g.id = group_id and g.is_active = true
    )
  );

drop policy if exists "public can read active product option links" on public.product_option_groups;
create policy "public can read active product option links"
  on public.product_option_groups for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.is_active = true
    )
    and exists (
      select 1 from public.option_groups g
      where g.id = group_id and g.is_active = true
    )
  );

drop policy if exists "store members manage option groups" on public.option_groups;
create policy "store members manage option groups"
  on public.option_groups for all
  using (public.can_manage_store(store_id))
  with check (public.can_manage_store(store_id));

drop policy if exists "store members manage option items" on public.option_group_items;
create policy "store members manage option items"
  on public.option_group_items for all
  using (exists (select 1 from public.option_groups g where g.id = group_id and public.can_manage_store(g.store_id)))
  with check (exists (select 1 from public.option_groups g where g.id = group_id and public.can_manage_store(g.store_id)));

drop policy if exists "store members manage product option links" on public.product_option_groups;
create policy "store members manage product option links"
  on public.product_option_groups for all
  using (
    exists (select 1 from public.products p where p.id = product_id and public.can_manage_store(p.store_id))
    and exists (select 1 from public.option_groups g where g.id = group_id and public.can_manage_store(g.store_id))
  )
  with check (
    exists (select 1 from public.products p where p.id = product_id and public.can_manage_store(p.store_id))
    and exists (select 1 from public.option_groups g where g.id = group_id and public.can_manage_store(g.store_id))
  );

notify pgrst, 'reload schema';
