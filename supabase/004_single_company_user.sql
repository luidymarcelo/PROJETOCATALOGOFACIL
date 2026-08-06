-- O usuário principal da empresa administra todas as suas filiais.
insert into public.tenant_members (tenant_id, user_id, role)
select distinct s.tenant_id, sm.user_id, 'manager'::public.member_role
from public.store_members sm
join public.stores s on s.id = sm.store_id
on conflict (tenant_id, user_id) do nothing;

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
