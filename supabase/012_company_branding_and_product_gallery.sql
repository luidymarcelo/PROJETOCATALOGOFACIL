-- Identidade visual e disponibilidade da empresa.
alter table public.tenants
  add column if not exists is_active boolean not null default true,
  add column if not exists theme_color text not null default '#176b52'
    check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists profile_image_url text;

drop policy if exists "platform admins update company identity" on public.tenants;
create policy "platform admins update company identity"
  on public.tenants for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.is_store_public(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stores s
    join public.tenants t on t.id = s.tenant_id
    where s.id = target_store_id
      and s.is_active
      and t.is_active
  );
$$;

revoke all on function public.is_store_public(uuid) from public;
grant execute on function public.is_store_public(uuid) to anon, authenticated;

drop policy if exists "public can read active stores" on public.stores;
create policy "public can read active stores"
  on public.stores for select
  using (public.is_store_public(id));

drop policy if exists "public can read active categories" on public.categories;
create policy "public can read active categories"
  on public.categories for select
  using (is_active and public.is_store_public(store_id));

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
  on public.products for select
  using (is_active and public.is_store_public(store_id));

-- Galeria de fotos dos produtos. products.image_url continua sendo a capa
-- para manter compatibilidade com integrações e catálogos existentes.
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, sort_order)
);

create index if not exists product_images_product_order_idx
  on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;

grant select on public.product_images to anon, authenticated;
grant insert, update, delete on public.product_images to authenticated;

create or replace function public.enforce_product_image_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_limit integer;
  current_count integer;
begin
  select least(10, greatest(1, coalesce(
    (
      select (sp.parameter_value #>> '{}')::integer
      from public.store_parameters sp
      where sp.store_id = new.store_id
        and sp.parameter_key = 'product_image_limit'
    ),
    (
      select (tp.parameter_value #>> '{}')::integer
      from public.tenant_parameters tp
      join public.stores s on s.tenant_id = tp.tenant_id
      where s.id = new.store_id
        and tp.parameter_key = 'product_image_limit'
    ),
    1
  ))) into configured_limit;

  select count(*) into current_count
  from public.product_images pi
  where pi.product_id = new.product_id
    and pi.id <> new.id;

  if current_count >= configured_limit then
    raise exception 'product image limit reached (% photos)', configured_limit using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_product_image_limit_trigger on public.product_images;
create trigger enforce_product_image_limit_trigger
before insert or update on public.product_images
for each row execute function public.enforce_product_image_limit();

drop policy if exists "public reads active product images" on public.product_images;
create policy "public reads active product images"
  on public.product_images for select
  using (
    public.is_store_public(store_id)
    and
    exists (
      select 1
      from public.products p
      where p.id = product_images.product_id
        and p.store_id = product_images.store_id
        and p.is_active
    )
  );

drop policy if exists "store managers add product images" on public.product_images;
create policy "store managers add product images"
  on public.product_images for insert
  to authenticated
  with check (
    public.can_manage_store(store_id)
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.store_id = store_id
    )
  );

drop policy if exists "store managers update product images" on public.product_images;
create policy "store managers update product images"
  on public.product_images for update
  to authenticated
  using (public.can_manage_store(store_id))
  with check (
    public.can_manage_store(store_id)
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.store_id = store_id
    )
  );

drop policy if exists "store managers delete product images" on public.product_images;
create policy "store managers delete product images"
  on public.product_images for delete
  to authenticated
  using (public.can_manage_store(store_id));

-- O catálogo recebe apenas os campos públicos da empresa.
drop function if exists public.get_public_catalog_companies();
create function public.get_public_catalog_companies()
returns table (
  tenant_id uuid,
  company_name text,
  theme_color text,
  profile_image_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.theme_color, t.profile_image_url
  from public.tenants t
  where t.is_active
    and exists (
      select 1
      from public.stores s
      where s.tenant_id = t.id
        and s.is_active
    )
  order by t.name;
$$;

revoke all on function public.get_public_catalog_companies() from public;
grant execute on function public.get_public_catalog_companies() to anon, authenticated;

-- Consulta exclusiva da Central dos administradores.
create or replace function public.get_admin_company_identities()
returns table (
  tenant_id uuid,
  is_active boolean,
  theme_color text,
  profile_image_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select t.id, t.is_active, t.theme_color, t.profile_image_url
  from public.tenants t
  order by t.created_at;
end;
$$;

revoke all on function public.get_admin_company_identities() from public;
grant execute on function public.get_admin_company_identities() to authenticated;

notify pgrst, 'reload schema';
