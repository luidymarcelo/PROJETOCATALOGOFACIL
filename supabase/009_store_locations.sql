-- Localização das filiais para retirada, mapa da comanda e busca por proximidade.
alter table public.stores
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stores_latitude_range') then
    alter table public.stores
      add constraint stores_latitude_range check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stores_longitude_range') then
    alter table public.stores
      add constraint stores_longitude_range check (longitude is null or longitude between -180 and 180);
  end if;
end;
$$;

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

  select tm.tenant_id
    into company_id
  from public.tenant_members tm
  where tm.user_id = current_user_id
    and tm.role in ('manager', 'staff')
  order by tm.created_at asc
  limit 1;

  if company_id is null then
    select s.tenant_id
      into company_id
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
        'cover_image_url', s.cover_image_url,
        'latitude', s.latitude,
        'longitude', s.longitude
      ) order by s.created_at asc
    ),
    '[]'::jsonb
  )
    into branch_rows
  from public.stores s
  where s.tenant_id = company_id;

  return jsonb_build_object('tenant', company_row, 'branches', branch_rows);
end;
$$;

revoke all on function public.get_company_workspace() from public;
grant execute on function public.get_company_workspace() to authenticated;
