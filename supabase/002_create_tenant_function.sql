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

notify pgrst, 'reload schema';
