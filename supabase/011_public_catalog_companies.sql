-- Exposes only the public company name needed by the storefront.
-- Private tenant fields remain protected by the tenants table RLS policies.
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
