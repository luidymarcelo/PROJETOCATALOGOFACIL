-- Permite que o mesmo usuario operacional acumule funcoes na empresa.
-- O campo role continua sendo preenchido para compatibilidade e auditoria;
-- roles passa a ser a fonte oficial das permissoes.

alter table public.company_users
  add column if not exists roles text[];

update public.company_users
set roles = array[role]
where roles is null or cardinality(roles) = 0;

alter table public.company_users
  alter column roles set default '{}'::text[],
  alter column roles set not null;

create or replace function public.normalize_company_user_roles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.roles is null or cardinality(new.roles) = 0 then
    new.roles := array[new.role];
  elsif tg_op = 'UPDATE'
    and new.roles is not distinct from old.roles
    and new.role is distinct from old.role then
    -- Mantem clientes antigos que ainda atualizam somente role funcionando.
    new.roles := array[new.role];
  else
    select array_agg(normalized.role_name order by normalized.first_position)
      into new.roles
    from (
      select role_name, min(role_position) as first_position
      from unnest(new.roles) with ordinality as selected(role_name, role_position)
      group by role_name
    ) normalized;
    new.role := new.roles[1];
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_company_user_roles on public.company_users;
create trigger normalize_company_user_roles
  before insert or update of role, roles on public.company_users
  for each row execute function public.normalize_company_user_roles();

alter table public.company_users
  drop constraint if exists company_users_roles_check;
alter table public.company_users
  add constraint company_users_roles_check check (
    cardinality(roles) > 0
    and roles <@ array['owner', 'branch_manager', 'waiter', 'cashier', 'kitchen', 'supervisor']::text[]
    and array_position(roles, null) is null
    and role = roles[1]
    and (
      (role = 'owner' and roles = array['owner']::text[])
      or (role <> 'owner' and not ('owner' = any(roles)))
    )
  );

create index if not exists company_users_roles_idx
  on public.company_users using gin (roles);

comment on column public.company_users.roles is
  'Funcoes acumuladas pelo usuario. role preserva a funcao principal para compatibilidade e auditoria.';

create or replace function public.effective_company_user_roles(stored_roles text[], stored_role text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(cardinality(stored_roles), 0) > 0 then stored_roles
    else array[stored_role]
  end;
$$;

create or replace function public.company_user_has_any_role(
  target_tenant_id uuid,
  target_user_id uuid,
  required_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users cu
    where cu.tenant_id = target_tenant_id
      and cu.user_id = target_user_id
      and cu.is_active
      and public.effective_company_user_roles(cu.roles, cu.role) && required_roles
  );
$$;

revoke all on function public.company_user_has_any_role(uuid, uuid, text[]) from public;
grant execute on function public.company_user_has_any_role(uuid, uuid, text[]) to authenticated;

create or replace function public.is_company_owner(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.company_user_has_any_role(target_tenant_id, auth.uid(), array['owner']::text[]);
$$;

create or replace function public.can_manage_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.stores s
    join public.company_users cu on cu.tenant_id = s.tenant_id
    where s.id = target_store_id
      and cu.user_id = auth.uid()
      and cu.is_active
      and (
        public.effective_company_user_roles(cu.roles, cu.role) && array['owner']::text[]
        or (
          public.effective_company_user_roles(cu.roles, cu.role) && array['branch_manager']::text[]
          and exists (
            select 1
            from public.company_user_stores cus
            where cus.tenant_id = cu.tenant_id
              and cus.user_id = cu.user_id
              and cus.store_id = s.id
          )
        )
      )
  );
$$;

create or replace function public.can_operate_store(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.stores s
    join public.company_users cu on cu.tenant_id = s.tenant_id
    where s.id = target_store_id
      and cu.user_id = auth.uid()
      and cu.is_active
      and (
        public.effective_company_user_roles(cu.roles, cu.role) && array['owner']::text[]
        or exists (
          select 1
          from public.company_user_stores cus
          where cus.tenant_id = cu.tenant_id
            and cus.user_id = cu.user_id
            and cus.store_id = s.id
        )
      )
  );
$$;

create or replace function public.can_manage_tenant_catalog(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_company_owner(target_tenant_id) or exists (
    select 1
    from public.company_users cu
    join public.company_user_stores cus
      on cus.tenant_id = cu.tenant_id
     and cus.user_id = cu.user_id
    join public.stores s
      on s.id = cus.store_id
     and s.tenant_id = cu.tenant_id
    where cu.tenant_id = target_tenant_id
      and cu.user_id = auth.uid()
      and public.effective_company_user_roles(cu.roles, cu.role) && array['branch_manager']::text[]
      and cu.is_active
  );
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

  select cu.tenant_id
    into company_id
  from public.company_users cu
  where cu.user_id = current_user_id
    and public.effective_company_user_roles(cu.roles, cu.role) && array['owner']::text[]
    and cu.is_active
  order by cu.created_at
  limit 1;

  if company_id is null then
    return jsonb_build_object(
      'error', 'Este login não possui acesso de proprietário.',
      'code', 'company_owner_access_not_found'
    );
  end if;

  select jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
    into company_row
  from public.tenants t
  where t.id = company_id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at), '[]'::jsonb)
    into branch_rows
  from public.stores s
  where s.tenant_id = company_id;

  return jsonb_build_object(
    'tenant', company_row,
    'branches', branch_rows,
    'access', jsonb_build_object('role', 'owner', 'roles', jsonb_build_array('owner'))
  );
end;
$$;

revoke all on function public.get_company_workspace() from public;
grant execute on function public.get_company_workspace() to authenticated;

create or replace function public.get_branch_workspace(p_cnpj text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  branch_row public.stores%rowtype;
  tenant_row public.tenants%rowtype;
  access_roles text[];
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if normalized_cnpj !~ '^[0-9]{14}$' then raise exception 'invalid cnpj'; end if;

  select s.* into branch_row from public.stores s where s.cnpj = normalized_cnpj;
  if branch_row.id is null then return jsonb_build_object('error', 'Filial não encontrada.', 'code', 'branch_not_found'); end if;

  select public.effective_company_user_roles(cu.roles, cu.role) into access_roles
  from public.company_users cu
  join public.company_user_stores cus
    on cus.tenant_id = cu.tenant_id and cus.user_id = cu.user_id
  where cu.user_id = current_user_id
    and cu.tenant_id = branch_row.tenant_id
    and public.effective_company_user_roles(cu.roles, cu.role) && array['branch_manager']::text[]
    and cu.is_active
    and cus.store_id = branch_row.id;

  if access_roles is null then
    return jsonb_build_object('error', 'Este usuário não possui acesso a esta filial.', 'code', 'branch_access_denied');
  end if;

  select * into tenant_row from public.tenants where id = branch_row.tenant_id;
  return jsonb_build_object(
    'tenant', jsonb_build_object('id', tenant_row.id, 'name', tenant_row.name, 'slug', tenant_row.slug),
    'branches', jsonb_build_array(to_jsonb(branch_row)),
    'access', jsonb_build_object('role', access_roles[1], 'roles', to_jsonb(access_roles))
  );
end;
$$;

revoke all on function public.get_branch_workspace(text) from public;
grant execute on function public.get_branch_workspace(text) to authenticated;

create or replace function public.get_operational_workspace(p_cnpj text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  branch_row public.stores%rowtype;
  tenant_row public.tenants%rowtype;
  access_row public.company_users%rowtype;
  access_roles text[];
  profile_name text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if normalized_cnpj !~ '^[0-9]{14}$' then raise exception 'invalid cnpj'; end if;
  select s.* into branch_row from public.stores s where s.cnpj = normalized_cnpj and s.is_active;
  if branch_row.id is null then return jsonb_build_object('error', 'Filial não encontrada ou inativa.', 'code', 'branch_not_found'); end if;

  select cu.* into access_row
  from public.company_users cu
  where cu.user_id = current_user_id
    and cu.tenant_id = branch_row.tenant_id
    and cu.is_active
    and (
      public.effective_company_user_roles(cu.roles, cu.role) && array['owner']::text[]
      or exists (
        select 1 from public.company_user_stores cus
        where cus.tenant_id = cu.tenant_id
          and cus.user_id = cu.user_id
          and cus.store_id = branch_row.id
      )
    );

  if access_row.user_id is null then
    return jsonb_build_object('error', 'Este usuário não possui acesso operacional a esta filial.', 'code', 'operation_access_denied');
  end if;

  access_roles := public.effective_company_user_roles(access_row.roles, access_row.role);
  select * into tenant_row from public.tenants where id = branch_row.tenant_id;
  select p.full_name into profile_name from public.profiles p where p.id = current_user_id;
  return jsonb_build_object(
    'tenant', jsonb_build_object('id', tenant_row.id, 'name', tenant_row.name, 'slug', tenant_row.slug),
    'branches', jsonb_build_array(to_jsonb(branch_row)),
    'access', jsonb_build_object('role', access_row.role, 'roles', to_jsonb(access_roles), 'name', coalesce(profile_name, 'Usuário')),
    'operation', jsonb_build_object(
      'entry_mode', coalesce(
        (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = branch_row.id and sp.parameter_key = 'internal_order_entry_mode'),
        'staff'
      ),
      'customer_name_mode', coalesce(
        (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = branch_row.id and sp.parameter_key = 'table_customer_name_mode'),
        'optional'
      ),
      'require_open_table_session', coalesce(
        (select (sp.parameter_value #>> '{}')::boolean from public.store_parameters sp where sp.store_id = branch_row.id and sp.parameter_key = 'require_open_table_session'),
        false
      )
    )
  );
end;
$$;

revoke all on function public.get_operational_workspace(text) from public;
grant execute on function public.get_operational_workspace(text) to authenticated;

create or replace function public.open_table_session(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  table_row public.restaurant_tables%rowtype;
  session_row public.table_sessions%rowtype;
  actor_roles text[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into table_row
  from public.restaurant_tables
  where id = p_table_id and is_active;
  if table_row.id is null or not public.can_operate_store(table_row.store_id) then
    raise exception 'table not found or access denied';
  end if;

  select public.effective_company_user_roles(cu.roles, cu.role) into actor_roles
  from public.stores s
  join public.company_users cu
    on cu.tenant_id = s.tenant_id
   and cu.user_id = auth.uid()
   and cu.is_active
  where s.id = table_row.store_id;
  if actor_roles is null or not (actor_roles && array['owner', 'branch_manager', 'waiter', 'supervisor']::text[]) then
    raise exception 'this role cannot open table sessions';
  end if;

  select * into session_row
  from public.table_sessions
  where table_id = table_row.id and status in ('open', 'awaiting_payment')
  order by opened_at desc
  limit 1;

  if session_row.id is null then
    begin
      insert into public.table_sessions (store_id, table_id, opened_by)
      values (table_row.store_id, table_row.id, auth.uid())
      returning * into session_row;
    exception when unique_violation then
      select * into session_row
      from public.table_sessions
      where table_id = table_row.id and status in ('open', 'awaiting_payment')
      order by opened_at desc
      limit 1;
    end;
  end if;

  return jsonb_build_object(
    'session_id', session_row.id,
    'table_id', table_row.id,
    'status', session_row.status,
    'opened_at', session_row.opened_at
  );
end;
$$;

revoke all on function public.open_table_session(uuid) from public;
grant execute on function public.open_table_session(uuid) to authenticated;

create or replace function public.update_table_session_status(p_session_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.table_sessions%rowtype;
  actor_roles text[];
begin
  if p_status not in ('open', 'awaiting_payment', 'closed', 'cancelled') then raise exception 'invalid table session status'; end if;
  select * into session_row from public.table_sessions where id = p_session_id;
  if session_row.id is null or not public.can_operate_store(session_row.store_id) then raise exception 'session not found or access denied'; end if;

  select public.effective_company_user_roles(cu.roles, cu.role) into actor_roles
  from public.stores s
  join public.company_users cu on cu.tenant_id = s.tenant_id and cu.user_id = auth.uid() and cu.is_active
  where s.id = session_row.store_id;
  if actor_roles is null or not (actor_roles && array['owner', 'branch_manager', 'cashier', 'supervisor']::text[]) then
    raise exception 'this role cannot close table sessions';
  end if;

  update public.table_sessions
  set status = p_status,
      closed_by = case when p_status in ('closed', 'cancelled') then auth.uid() else null end,
      closed_at = case when p_status in ('closed', 'cancelled') then now() else null end,
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object('session_id', p_session_id, 'status', p_status);
end;
$$;

revoke all on function public.update_table_session_status(uuid, text) from public;
grant execute on function public.update_table_session_status(uuid, text) to authenticated;

create or replace function public.update_internal_order(
  p_order_id uuid,
  p_status text default null,
  p_payment_status text default null,
  p_billing_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  actor_roles text[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into order_row from public.orders where id = p_order_id and order_channel = 'internal';
  if order_row.id is null or not public.can_operate_store(order_row.store_id) then
    raise exception 'order not found or access denied';
  end if;

  select public.effective_company_user_roles(cu.roles, cu.role) into actor_roles
  from public.stores s
  join public.company_users cu
    on cu.tenant_id = s.tenant_id
   and cu.user_id = auth.uid()
   and cu.is_active
  where s.id = order_row.store_id;

  if p_status is not null then
    if p_status not in ('accepted', 'preparing', 'ready', 'completed', 'cancelled') then
      raise exception 'invalid order status';
    end if;
    if actor_roles is null or not (actor_roles && array['owner', 'branch_manager', 'waiter', 'kitchen', 'supervisor']::text[]) then
      raise exception 'this role cannot update order status';
    end if;
  end if;

  if p_payment_status is not null or p_billing_status is not null then
    if actor_roles is null or not (actor_roles && array['owner', 'branch_manager', 'cashier', 'supervisor']::text[]) then
      raise exception 'this role cannot update payment or billing';
    end if;
    if p_payment_status is not null and p_payment_status not in ('pending', 'paid', 'refunded') then
      raise exception 'invalid payment status';
    end if;
    if p_billing_status is not null and p_billing_status not in ('pending', 'billed', 'cancelled') then
      raise exception 'invalid billing status';
    end if;
  end if;

  if p_status is null and p_payment_status is null and p_billing_status is null then
    raise exception 'no order changes informed';
  end if;

  update public.orders
  set status = coalesce(p_status::public.order_status, status),
      payment_status = coalesce(p_payment_status, payment_status),
      billing_status = coalesce(p_billing_status, billing_status)
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', coalesce(p_status, order_row.status::text),
    'payment_status', coalesce(p_payment_status, order_row.payment_status),
    'billing_status', coalesce(p_billing_status, order_row.billing_status)
  );
end;
$$;

revoke all on function public.update_internal_order(uuid, text, text, text) from public;
grant execute on function public.update_internal_order(uuid, text, text, text) to authenticated;

create or replace function public.create_internal_order_v2(
  p_store_id uuid,
  p_customer_name text,
  p_table_id uuid,
  p_table_token uuid,
  p_order_source text,
  p_fulfillment_mode text,
  p_delivery_address text,
  p_reference text,
  p_service_location text,
  p_payment_method text,
  p_change_for numeric,
  p_notes text,
  p_latitude numeric,
  p_longitude numeric,
  p_delivery_fee numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_mode text;
  v_additions_enabled boolean;
  v_entry_mode text;
  v_name_mode text;
  v_require_open boolean;
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_roles text[];
  v_actor_name text;
  v_table public.restaurant_tables%rowtype;
  v_session_id uuid;
  v_order_id uuid;
  v_order_code text;
  v_item jsonb;
  v_product record;
  v_options jsonb;
  v_resolved_options jsonb;
  v_option jsonb;
  v_option_delta numeric;
  v_option_item_name text;
  v_option_group_id uuid;
  v_option_group_name text;
  v_quantity numeric;
  v_options_total numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := greatest(coalesce(p_delivery_fee, 0), 0);
  v_customer_name text := nullif(trim(coalesce(p_customer_name, '')), '');
  v_service_location text := nullif(trim(coalesce(p_service_location, '')), '');
begin
  if p_order_source not in ('table_device', 'staff') then raise exception 'invalid order source'; end if;
  if p_fulfillment_mode not in ('delivery', 'pickup') then raise exception 'invalid fulfillment mode'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'at least one item is required'; end if;

  select s.tenant_id into v_tenant_id
  from public.stores s
  join public.tenants t on t.id = s.tenant_id
  where s.id = p_store_id and s.is_active and t.is_active;
  if v_tenant_id is null then raise exception 'store is not available'; end if;

  select coalesce(
    (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = p_store_id and sp.parameter_key = 'order_mode'),
    (select tp.parameter_value #>> '{}' from public.tenant_parameters tp where tp.tenant_id = v_tenant_id and tp.parameter_key = 'order_mode'),
    'whatsapp'
  ) into v_order_mode;
  if v_order_mode not in ('internal', 'both') then raise exception 'internal orders are disabled for this store'; end if;

  select coalesce(
    (select (sp.parameter_value #>> '{}')::boolean from public.store_parameters sp where sp.store_id = p_store_id and sp.parameter_key = 'enable_additions'),
    (select (tp.parameter_value #>> '{}')::boolean from public.tenant_parameters tp where tp.tenant_id = v_tenant_id and tp.parameter_key = 'enable_additions'),
    false
  ) into v_additions_enabled;

  select coalesce(
    (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = p_store_id and sp.parameter_key = 'internal_order_entry_mode'),
    'staff'
  ) into v_entry_mode;
  select coalesce(
    (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = p_store_id and sp.parameter_key = 'table_customer_name_mode'),
    'optional'
  ) into v_name_mode;
  select coalesce(
    (select (sp.parameter_value #>> '{}')::boolean from public.store_parameters sp where sp.store_id = p_store_id and sp.parameter_key = 'require_open_table_session'),
    false
  ) into v_require_open;

  if p_order_source = 'table_device' then
    if v_entry_mode not in ('table', 'both') then raise exception 'table orders are disabled for this store'; end if;
    select rt.* into v_table
    from public.restaurant_tables rt
    where rt.store_id = p_store_id and rt.access_token = p_table_token and rt.is_active;
    if v_table.id is null then raise exception 'invalid table access'; end if;
    if v_name_mode = 'required' and v_customer_name is null then raise exception 'customer name is required'; end if;
    if v_name_mode = 'hidden' then v_customer_name := null; end if;
    v_actor_name := 'Dispositivo da mesa';
    v_actor_role := 'table_device';
  else
    if v_entry_mode not in ('staff', 'both') then raise exception 'staff orders are disabled for this store'; end if;
    if v_actor_id is null or not public.can_operate_store(p_store_id) then raise exception 'authenticated staff access is required'; end if;
    select cu.role, public.effective_company_user_roles(cu.roles, cu.role)
      into v_actor_role, v_actor_roles
    from public.company_users cu
    where cu.tenant_id = v_tenant_id and cu.user_id = v_actor_id and cu.is_active;
    if v_actor_roles is null or not (v_actor_roles && array['owner', 'branch_manager', 'waiter', 'supervisor']::text[]) then
      raise exception 'this role cannot create orders';
    end if;
    if v_actor_role not in ('owner', 'branch_manager', 'waiter', 'supervisor') then
      select selected_role into v_actor_role
      from unnest(v_actor_roles) with ordinality as permitted(selected_role, role_position)
      where selected_role in ('owner', 'branch_manager', 'waiter', 'supervisor')
      order by role_position
      limit 1;
    end if;
    select p.full_name into v_actor_name from public.profiles p where p.id = v_actor_id;
    v_actor_name := coalesce(nullif(trim(v_actor_name), ''), 'Funcionário');

    if p_table_id is not null then
      select rt.* into v_table from public.restaurant_tables rt
      where rt.id = p_table_id and rt.store_id = p_store_id and rt.is_active;
      if v_table.id is null then raise exception 'invalid table'; end if;
    elsif exists (select 1 from public.restaurant_tables rt where rt.store_id = p_store_id and rt.is_active) then
      raise exception 'select a table before creating the order';
    end if;
  end if;

  if v_table.id is not null then
    v_service_location := coalesce(nullif(trim(v_table.name), ''), 'Mesa ' || v_table.code);
    select ts.id into v_session_id
    from public.table_sessions ts
    where ts.table_id = v_table.id and ts.status in ('open', 'awaiting_payment')
    order by ts.opened_at desc limit 1;

    if v_session_id is null and v_require_open and p_order_source = 'table_device' then
      raise exception 'this table must be opened by staff before ordering';
    end if;

    if v_session_id is null then
      begin
        insert into public.table_sessions (store_id, table_id, opened_by)
        values (p_store_id, v_table.id, case when p_order_source = 'staff' then v_actor_id else null end)
        returning id into v_session_id;
      exception when unique_violation then
        select ts.id into v_session_id from public.table_sessions ts
        where ts.table_id = v_table.id and ts.status in ('open', 'awaiting_payment')
        order by ts.opened_at desc limit 1;
      end;
    end if;
  end if;

  insert into public.orders (
    store_id, status, order_channel, fulfillment_mode, customer_name,
    delivery_address, customer_reference, service_location,
    customer_latitude, customer_longitude, payment_method, change_for,
    notes, delivery_fee, table_id, table_session_id, order_source,
    created_by_user_id, created_by_name, created_by_role
  ) values (
    p_store_id, 'accepted', 'internal', p_fulfillment_mode, v_customer_name,
    nullif(trim(coalesce(p_delivery_address, '')), ''),
    nullif(trim(coalesce(p_reference, '')), ''), v_service_location,
    p_latitude, p_longitude, nullif(trim(coalesce(p_payment_method, '')), ''),
    p_change_for, nullif(trim(coalesce(p_notes, '')), ''), v_delivery_fee,
    v_table.id, v_session_id, p_order_source,
    case when p_order_source = 'staff' then v_actor_id else null end,
    v_actor_name, v_actor_role
  ) returning id, order_code into v_order_id, v_order_code;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'product_id', '') is null then raise exception 'product id is required'; end if;
    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    if v_quantity <= 0 or v_quantity > 999 then raise exception 'invalid item quantity'; end if;
    select p.id, p.name, p.price into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.store_id = p_store_id and p.is_active;
    if not found then raise exception 'product is not available'; end if;

    v_options := case when jsonb_typeof(v_item->'selected_options') = 'array' then v_item->'selected_options' else '[]'::jsonb end;
    if not v_additions_enabled and jsonb_array_length(v_options) > 0 then
      raise exception 'additions are disabled for this store';
    end if;
    v_options_total := 0;
    v_resolved_options := '[]'::jsonb;
    if jsonb_array_length(v_options) <> (
      select count(distinct option_row.value->>'item_id')
      from jsonb_array_elements(v_options) option_row
    ) then
      raise exception 'the same addition cannot be selected twice';
    end if;
    for v_option in select value from jsonb_array_elements(v_options)
    loop
      v_option_delta := null;
      select ogi.price_delta, ogi.name, og.id, og.name
        into v_option_delta, v_option_item_name, v_option_group_id, v_option_group_name
      from public.option_group_items ogi
      join public.option_groups og on og.id = ogi.group_id
      join public.product_option_groups pog on pog.group_id = og.id
      where ogi.id = (v_option->>'item_id')::uuid
        and ogi.is_active and og.is_active and pog.product_id = v_product.id;
      if v_option_delta is null then raise exception 'selected addition is not available for this product'; end if;
      v_options_total := v_options_total + v_option_delta;
      v_resolved_options := v_resolved_options || jsonb_build_array(jsonb_build_object(
        'group_id', v_option_group_id,
        'group_name', v_option_group_name,
        'item_id', (v_option->>'item_id')::uuid,
        'item_name', v_option_item_name,
        'price_delta', v_option_delta
      ));
    end loop;

    if v_additions_enabled and exists (
      select 1
      from public.product_option_groups pog
      join public.option_groups og on og.id = pog.group_id and og.is_active
      where pog.product_id = v_product.id
        and (
          (select count(*) from jsonb_array_elements(v_resolved_options) selected where (selected.value->>'group_id')::uuid = og.id) < og.min_selections
          or (select count(*) from jsonb_array_elements(v_resolved_options) selected where (selected.value->>'group_id')::uuid = og.id) > og.max_selections
        )
    ) then
      raise exception 'selected additions do not satisfy the product group rules';
    end if;

    v_unit_price := round((v_product.price + v_options_total)::numeric, 2);
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, total, selected_options)
    values (v_order_id, v_product.id, v_product.name, v_unit_price, v_quantity, round((v_unit_price * v_quantity)::numeric, 2), v_resolved_options);
  end loop;

  update public.orders
  set subtotal = round(v_subtotal::numeric, 2), total = round((v_subtotal + v_delivery_fee)::numeric, 2)
  where id = v_order_id;

  insert into public.order_events (order_id, store_id, event_type, to_value, actor_user_id, actor_name, metadata)
  values (
    v_order_id, p_store_id, 'created', 'accepted',
    case when p_order_source = 'staff' then v_actor_id else null end,
    v_actor_name,
    jsonb_build_object('source', p_order_source, 'role', v_actor_role, 'roles', to_jsonb(v_actor_roles), 'table_id', v_table.id, 'table_session_id', v_session_id)
  );

  return jsonb_build_object(
    'order_id', v_order_id, 'order_code', v_order_code,
    'table_id', v_table.id, 'table_session_id', v_session_id,
    'subtotal', round(v_subtotal::numeric, 2),
    'delivery_fee', round(v_delivery_fee::numeric, 2),
    'total', round((v_subtotal + v_delivery_fee)::numeric, 2)
  );
end;
$$;

revoke all on function public.create_internal_order_v2(
  uuid, text, uuid, uuid, text, text, text, text, text, text, numeric, text, numeric, numeric, numeric, jsonb
) from public;
grant execute on function public.create_internal_order_v2(
  uuid, text, uuid, uuid, text, text, text, text, text, text, numeric, text, numeric, numeric, numeric, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
