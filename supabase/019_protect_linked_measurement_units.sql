create or replace function public.prevent_linked_measurement_unit_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.tenants t
    where t.id = old.tenant_id
  ) and exists (
    select 1
    from public.products p
    join public.stores s on s.id = p.store_id
    where s.tenant_id = old.tenant_id
      and p.unit is not null
      and lower(trim(p.unit)) in (lower(trim(old.code)), lower(trim(old.name)))
  ) then
    raise exception 'A unidade de medida "%" está vinculada a produtos e não pode ser excluída.', old.name
      using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_linked_measurement_unit_delete on public.measurement_units;
create trigger prevent_linked_measurement_unit_delete
  before delete on public.measurement_units
  for each row execute function public.prevent_linked_measurement_unit_delete();

notify pgrst, 'reload schema';
