-- Parametros gerais da empresa e sobrescritas opcionais por filial.
create table if not exists public.tenant_parameters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parameter_key text not null check (parameter_key ~ '^[a-z][a-z0-9_]*$'),
  parameter_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, parameter_key)
);

create table if not exists public.store_parameters (
  store_id uuid not null references public.stores(id) on delete cascade,
  parameter_key text not null check (parameter_key ~ '^[a-z][a-z0-9_]*$'),
  parameter_value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (store_id, parameter_key)
);

create index if not exists tenant_parameters_key_idx
  on public.tenant_parameters (parameter_key);
create index if not exists store_parameters_key_idx
  on public.store_parameters (parameter_key);

-- Mantem o comportamento atual para empresas existentes.
insert into public.tenant_parameters (tenant_id, parameter_key, parameter_value, is_public)
select id, 'calculate_delivery_fee', 'true'::jsonb, true
from public.tenants
on conflict (tenant_id, parameter_key) do nothing;

alter table public.tenant_parameters enable row level security;
alter table public.store_parameters enable row level security;

drop policy if exists "public reads catalog tenant parameters" on public.tenant_parameters;
create policy "public reads catalog tenant parameters"
  on public.tenant_parameters for select
  using (
    is_public
    and exists (
      select 1 from public.stores s
      where s.tenant_id = tenant_parameters.tenant_id and s.is_active = true
    )
  );

drop policy if exists "platform admins manage tenant parameters" on public.tenant_parameters;
create policy "platform admins manage tenant parameters"
  on public.tenant_parameters for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "public reads catalog store parameters" on public.store_parameters;
create policy "public reads catalog store parameters"
  on public.store_parameters for select
  using (
    is_public
    and exists (
      select 1 from public.stores s
      where s.id = store_parameters.store_id and s.is_active = true
    )
  );

drop policy if exists "platform admins manage store parameters" on public.store_parameters;
create policy "platform admins manage store parameters"
  on public.store_parameters for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select on public.tenant_parameters to anon, authenticated;
grant select on public.store_parameters to anon, authenticated;
grant insert, update, delete on public.tenant_parameters to authenticated;
grant insert, update, delete on public.store_parameters to authenticated;

create or replace function public.get_company_workspace()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  company_id uuid;
  company_row jsonb;
  branch_rows jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select tm.tenant_id into company_id
  from public.tenant_members tm
  where tm.user_id = current_user_id and tm.role in ('manager', 'staff')
  order by tm.created_at asc
  limit 1;

  if company_id is null then
    select s.tenant_id into company_id
    from public.store_members sm
    join public.stores s on s.id = sm.store_id
    where sm.user_id = current_user_id
    order by sm.created_at asc
    limit 1;

    if company_id is not null then
      insert into public.tenant_members (tenant_id, user_id, role)
      values (company_id, current_user_id, 'manager')
      on conflict (tenant_id, user_id) do update set role = 'manager';
    end if;
  end if;

  if company_id is null then
    return jsonb_build_object(
      'error', 'Este login nao esta vinculado a uma empresa.',
      'code', 'company_access_not_found'
    );
  end if;

  select jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
    into company_row
  from public.tenants t
  where t.id = company_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'slug', s.slug,
        'tenant_id', s.tenant_id,
        'address', s.address,
        'cover_image_url', s.cover_image_url,
        'latitude', s.latitude,
        'longitude', s.longitude,
        'delivery_fee', s.delivery_fee
      ) order by s.created_at asc
    ),
    '[]'::jsonb
  ) into branch_rows
  from public.stores s
  where s.tenant_id = company_id;

  return jsonb_build_object('tenant', company_row, 'branches', branch_rows);
end;
$$;

revoke all on function public.get_company_workspace() from public;
grant execute on function public.get_company_workspace() to authenticated;
