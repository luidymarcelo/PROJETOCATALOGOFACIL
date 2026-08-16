-- Observacao curta posicionada sobre a capa publica de cada filial.
alter table public.stores
  add column if not exists cover_note text,
  add column if not exists cover_note_position text not null default 'top-right';

update public.stores
set cover_note_position = 'top-right'
where cover_note_position is null
   or cover_note_position not in (
     'top-left', 'top-center', 'top-right',
     'center-left', 'center', 'center-right',
     'bottom-left', 'bottom-center', 'bottom-right'
   );

alter table public.stores
  alter column cover_note_position set default 'top-right',
  alter column cover_note_position set not null;

alter table public.stores drop constraint if exists stores_cover_note_length_check;
alter table public.stores
  add constraint stores_cover_note_length_check
  check (cover_note is null or char_length(cover_note) <= 160);

alter table public.stores drop constraint if exists stores_cover_note_position_check;
alter table public.stores
  add constraint stores_cover_note_position_check
  check (cover_note_position in (
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ));

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
        'whatsapp_phone', s.whatsapp_phone,
        'address', s.address,
        'cover_image_url', s.cover_image_url,
        'cover_note', s.cover_note,
        'cover_note_position', s.cover_note_position,
        'latitude', s.latitude,
        'longitude', s.longitude,
        'minimum_order', s.minimum_order,
        'delivery_fee', s.delivery_fee,
        'delivery_time_label', s.delivery_time_label,
        'is_active', s.is_active
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
