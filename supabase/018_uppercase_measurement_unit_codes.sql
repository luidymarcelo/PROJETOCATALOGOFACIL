do $$
begin
  if to_regclass('public.measurement_units') is null then
    raise exception 'A tabela public.measurement_units não existe. Execute primeiro a migration 016_measurement_units.sql.';
  end if;

  if exists (
    select 1
    from public.measurement_units
    group by tenant_id, upper(trim(code))
    having count(*) > 1
  ) then
    raise exception 'Existem códigos de unidade duplicados ao desconsiderar maiúsculas e minúsculas. Corrija as duplicidades antes de executar esta migration.';
  end if;
end;
$$;

create or replace function public.normalize_measurement_unit_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := upper(trim(new.code));
  return new;
end;
$$;

drop trigger if exists normalize_measurement_unit_code on public.measurement_units;
create trigger normalize_measurement_unit_code
  before insert or update of code on public.measurement_units
  for each row execute function public.normalize_measurement_unit_code();

update public.measurement_units
set code = upper(trim(code))
where code is distinct from upper(trim(code));

alter table public.measurement_units
  drop constraint if exists measurement_units_code_check;

alter table public.measurement_units
  add constraint measurement_units_code_check
  check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,19}$' and code = upper(code));

notify pgrst, 'reload schema';
