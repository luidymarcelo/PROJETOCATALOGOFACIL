-- Recupera a empresa do usuario autenticado e migra acessos antigos por filial.
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
        'cover_image_url', s.cover_image_url
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

-- Garante que o usuario principal da empresa administre todas as filiais.
create or replace function public.can_manage_store(target_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.stores s
    where s.id = target_store_id
      and (
        public.is_tenant_admin(s.tenant_id)
        or exists (
          select 1
          from public.tenant_members tm
          where tm.tenant_id = s.tenant_id
            and tm.user_id = auth.uid()
            and tm.role in ('manager', 'staff')
        )
      )
  );
$$;
