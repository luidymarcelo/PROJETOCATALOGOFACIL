create table if not exists public.measurement_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,19}$' and code = upper(code)),
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, name)
);

create index if not exists measurement_units_tenant_order_idx
  on public.measurement_units (tenant_id, sort_order, name);

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

alter table public.measurement_units enable row level security;

drop policy if exists "members can read measurement units" on public.measurement_units;
create policy "members can read measurement units"
  on public.measurement_units for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = measurement_units.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'manager', 'staff')
    )
  );

drop policy if exists "members can manage measurement units" on public.measurement_units;
create policy "members can manage measurement units"
  on public.measurement_units for all
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = measurement_units.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'manager', 'staff')
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.tenant_members tm
      where tm.tenant_id = measurement_units.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin', 'manager', 'staff')
    )
  );

grant select, insert, update, delete on public.measurement_units to authenticated;

notify pgrst, 'reload schema';
