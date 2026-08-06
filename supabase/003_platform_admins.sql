-- Controle da Central dos administradores.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'luidy123neres@gmail.com'
on conflict (user_id) do nothing;

alter table public.platform_admins enable row level security;
drop policy if exists "platform admins can read platform admins" on public.platform_admins;
create policy "platform admins can read platform admins"
  on public.platform_admins for select
  using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

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
    left join public.store_members sm on sm.store_id = s.id and sm.user_id = auth.uid()
    where s.id = target_store_id
      and (public.is_tenant_admin(s.tenant_id) or sm.role in ('owner', 'admin', 'manager', 'staff'))
  );
$$;

drop policy if exists "platform admins can read all tenants" on public.tenants;
create policy "platform admins can read all tenants"
  on public.tenants for select
  using (public.is_platform_admin());

drop policy if exists "platform admins manage all stores" on public.stores;
create policy "platform admins manage all stores"
  on public.stores for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform admins read all memberships" on public.tenant_members;
create policy "platform admins read all memberships"
  on public.tenant_members for select
  using (public.is_platform_admin());

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
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'only platform administrators can create companies';
  end if;

  insert into public.tenants (name, slug, owner_name, owner_phone)
  values (tenant_name, tenant_slug, owner_name, owner_phone)
  returning id into new_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'owner');

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text, text, text) to authenticated;
