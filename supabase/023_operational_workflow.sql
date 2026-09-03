-- Operational workflow for internal commands.
-- Run after 022_multi_role_company_users.sql.

alter table public.order_items
  add column if not exists production_status text not null default 'pending',
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists ready_at timestamptz,
  add column if not exists ready_by uuid references auth.users(id) on delete set null,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references auth.users(id) on delete set null;

alter table public.table_sessions
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists closing_requested_at timestamptz,
  add column if not exists closing_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_production_status_check') then
    alter table public.order_items add constraint order_items_production_status_check
      check (production_status in ('pending', 'preparing', 'ready', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_delivery_status_check') then
    alter table public.order_items add constraint order_items_delivery_status_check
      check (delivery_status in ('pending', 'delivered', 'cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'table_sessions_payment_status_check') then
    alter table public.table_sessions add constraint table_sessions_payment_status_check
      check (payment_status in ('pending', 'paid', 'refunded'));
  end if;
end;
$$;

create index if not exists order_items_order_production_idx
  on public.order_items (order_id, production_status, delivery_status);
create index if not exists table_sessions_store_workflow_idx
  on public.table_sessions (store_id, status, payment_status, opened_at desc);

update public.order_items oi
set production_status = case
      when o.status in ('ready', 'completed') then 'ready'
      when o.status = 'preparing' then 'preparing'
      else oi.production_status
    end,
    delivery_status = case when o.status = 'completed' then 'delivered' else oi.delivery_status end,
    ready_at = case when o.status in ('ready', 'completed') then coalesce(oi.ready_at, o.created_at) else oi.ready_at end,
    delivered_at = case when o.status = 'completed' then coalesce(oi.delivered_at, o.created_at) else oi.delivered_at end
from public.orders o
where o.id = oi.order_id
  and o.order_channel = 'internal';

update public.table_sessions ts
set payment_status = 'paid',
    payment_method = coalesce(ts.payment_method, paid_orders.payment_method),
    payment_confirmed_at = coalesce(ts.payment_confirmed_at, paid_orders.paid_at)
from (
  select o.table_session_id,
         max(o.payment_method) filter (where o.payment_method is not null) as payment_method,
         max(o.created_at) as paid_at
  from public.orders o
  where o.order_channel = 'internal'
    and o.table_session_id is not null
  group by o.table_session_id
  having count(*) filter (where o.status <> 'cancelled') > 0
     and count(*) filter (where o.status <> 'cancelled' and o.payment_status <> 'paid') = 0
) paid_orders
where paid_orders.table_session_id = ts.id
  and ts.payment_status = 'pending';

create or replace function public.block_orders_while_table_is_closing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_status text;
begin
  if new.order_channel = 'internal' and new.table_session_id is not null then
    select ts.status into active_status
    from public.table_sessions ts
    where ts.id = new.table_session_id
    for update;
    if active_status = 'awaiting_payment' then
      raise exception 'table is awaiting payment';
    end if;
    if active_status is distinct from 'open' then
      raise exception 'table session is not open';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists block_orders_while_table_is_closing on public.orders;
create trigger block_orders_while_table_is_closing
before insert on public.orders
for each row execute function public.block_orders_while_table_is_closing();

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

  select s.* into branch_row
  from public.stores s
  where s.cnpj = normalized_cnpj and s.is_active;
  if branch_row.id is null then
    return jsonb_build_object('error', 'Filial não encontrada ou inativa.', 'code', 'branch_not_found');
  end if;

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
    'access', jsonb_build_object(
      'role', access_row.role,
      'roles', to_jsonb(access_roles),
      'name', coalesce(nullif(trim(profile_name), ''), 'Usuário')
    ),
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
      ),
      'flow', coalesce(
        (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = branch_row.id and sp.parameter_key = 'operation_flow'),
        'complete'
      ),
      'production_release_mode', coalesce(
        (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = branch_row.id and sp.parameter_key = 'production_release_mode'),
        'whole_order'
      )
    )
  );
end;
$$;

revoke all on function public.get_operational_workspace(text) from public;
grant execute on function public.get_operational_workspace(text) to authenticated;

create or replace function public.get_table_catalog_context(p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'table_id', rt.id,
    'table_code', rt.code,
    'table_name', coalesce(nullif(trim(rt.name), ''), 'Mesa ' || rt.code),
    'store_id', s.id,
    'store_slug', s.slug,
    'store_name', s.name,
    'company_name', t.name,
    'customer_name_mode', coalesce(
      (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = s.id and sp.parameter_key = 'table_customer_name_mode'),
      'optional'
    ),
    'require_open_session', coalesce(
      (select (sp.parameter_value #>> '{}')::boolean from public.store_parameters sp where sp.store_id = s.id and sp.parameter_key = 'require_open_table_session'),
      false
    ),
    'session_open', exists (
      select 1 from public.table_sessions ts where ts.table_id = rt.id and ts.status = 'open'
    ),
    'session_closing', exists (
      select 1 from public.table_sessions ts where ts.table_id = rt.id and ts.status = 'awaiting_payment'
    )
  ) into result
  from public.restaurant_tables rt
  join public.stores s on s.id = rt.store_id and s.is_active
  join public.tenants t on t.id = s.tenant_id and t.is_active
  where rt.access_token = p_access_token
    and rt.is_active
    and coalesce(
      (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = s.id and sp.parameter_key = 'internal_order_entry_mode'),
      'staff'
    ) in ('table', 'both')
    and coalesce(
      (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = s.id and sp.parameter_key = 'order_mode'),
      (select tp.parameter_value #>> '{}' from public.tenant_parameters tp where tp.tenant_id = s.tenant_id and tp.parameter_key = 'order_mode'),
      'whatsapp'
    ) in ('internal', 'both');

  return coalesce(result, jsonb_build_object('error', 'Acesso da mesa inválido ou desativado.', 'code', 'table_access_invalid'));
end;
$$;

revoke all on function public.get_table_catalog_context(uuid) from public;
grant execute on function public.get_table_catalog_context(uuid) to anon, authenticated;

create or replace function public.run_internal_workflow_action(
  p_action text,
  p_order_id uuid default null,
  p_item_id uuid default null,
  p_session_id uuid default null,
  p_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_roles text[];
  actor_name text;
  target_order public.orders%rowtype;
  target_session public.table_sessions%rowtype;
  target_item public.order_items%rowtype;
  target_store_id uuid;
  operation_flow text;
  release_mode text;
  remaining_count integer;
  changed_count integer;
  next_order_status text;
  normalized_method text := nullif(trim(coalesce(p_payment_method, '')), '');
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if p_action not in (
    'start_preparation', 'mark_ready', 'mark_delivered',
    'request_closing', 'reopen_table', 'confirm_payment',
    'release_table', 'cancel_session'
  ) then
    raise exception 'invalid workflow action';
  end if;

  if p_item_id is not null then
    select oi.* into target_item from public.order_items oi where oi.id = p_item_id;
    if target_item.id is null then raise exception 'order item not found'; end if;
    if p_order_id is not null and target_item.order_id <> p_order_id then raise exception 'item does not belong to order'; end if;
    p_order_id := target_item.order_id;
  end if;

  if p_order_id is not null then
    select o.* into target_order
    from public.orders o
    where o.id = p_order_id and o.order_channel = 'internal';
    if target_order.id is null then raise exception 'order not found'; end if;
    target_store_id := target_order.store_id;
    if p_session_id is null then p_session_id := target_order.table_session_id; end if;
  end if;

  if p_session_id is not null then
    select ts.* into target_session from public.table_sessions ts where ts.id = p_session_id;
    if target_session.id is null then raise exception 'table session not found'; end if;
    if target_store_id is not null and target_session.store_id <> target_store_id then raise exception 'session does not belong to order'; end if;
    if target_order.id is not null and target_order.table_session_id is not null and target_order.table_session_id <> target_session.id then raise exception 'session does not belong to order'; end if;
    target_store_id := target_session.store_id;
  end if;

  if target_store_id is null or not public.can_operate_store(target_store_id) then
    raise exception 'workflow target not found or access denied';
  end if;

  select public.effective_company_user_roles(cu.roles, cu.role)
    into actor_roles
  from public.stores s
  join public.company_users cu
    on cu.tenant_id = s.tenant_id
   and cu.user_id = actor_id
   and cu.is_active
  where s.id = target_store_id;
  if actor_roles is null then raise exception 'operational access not found'; end if;

  select coalesce(nullif(trim(p.full_name), ''), 'Funcionário')
    into actor_name
  from public.profiles p
  where p.id = actor_id;
  actor_name := coalesce(actor_name, 'Funcionário');

  select coalesce(
    (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = target_store_id and sp.parameter_key = 'operation_flow'),
    'complete'
  ) into operation_flow;
  select coalesce(
    (select sp.parameter_value #>> '{}' from public.store_parameters sp where sp.store_id = target_store_id and sp.parameter_key = 'production_release_mode'),
    'whole_order'
  ) into release_mode;
  if operation_flow not in ('simplified', 'complete') then operation_flow := 'complete'; end if;
  if release_mode not in ('whole_order', 'per_item') then release_mode := 'whole_order'; end if;

  if p_action = 'start_preparation' then
    if target_order.id is null then raise exception 'order is required'; end if;
    if operation_flow <> 'complete' then raise exception 'kitchen actions are disabled in simplified flow'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'kitchen', 'supervisor']::text[]) then raise exception 'this role cannot manage production'; end if;
    if target_order.status not in ('accepted', 'preparing') then raise exception 'order cannot start preparation in its current state'; end if;

    update public.order_items
    set production_status = 'preparing'
    where order_id = target_order.id and production_status = 'pending';
    update public.orders set status = 'preparing' where id = target_order.id;
    next_order_status := 'preparing';

  elsif p_action = 'mark_ready' then
    if target_order.id is null then raise exception 'order is required'; end if;
    if operation_flow <> 'complete' then raise exception 'kitchen actions are disabled in simplified flow'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'kitchen', 'supervisor']::text[]) then raise exception 'this role cannot manage production'; end if;
    if target_order.status in ('cancelled', 'completed') then raise exception 'order cannot be prepared in its current state'; end if;
    if p_item_id is not null and release_mode <> 'per_item' then raise exception 'this branch releases only whole orders'; end if;

    if p_item_id is not null then
      update public.order_items
      set production_status = 'ready', ready_at = now(), ready_by = actor_id
      where id = p_item_id and production_status in ('pending', 'preparing');
    else
      update public.order_items
      set production_status = 'ready', ready_at = coalesce(ready_at, now()), ready_by = actor_id
      where order_id = target_order.id and production_status in ('pending', 'preparing');
    end if;
    get diagnostics changed_count = row_count;
    if changed_count = 0 then raise exception 'order items are already ready'; end if;

    select count(*) into remaining_count
    from public.order_items
    where order_id = target_order.id and production_status not in ('ready', 'cancelled');
    next_order_status := case when remaining_count = 0 then 'ready' else 'preparing' end;
    update public.orders set status = next_order_status::public.order_status where id = target_order.id;

  elsif p_action = 'mark_delivered' then
    if target_order.id is null then raise exception 'order is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'waiter', 'supervisor']::text[]) then raise exception 'this role cannot confirm delivery'; end if;
    if target_order.status = 'cancelled' then raise exception 'cancelled order cannot be delivered'; end if;

    if p_item_id is not null then
      update public.order_items
      set delivery_status = 'delivered', delivered_at = now(), delivered_by = actor_id
      where id = p_item_id
        and delivery_status = 'pending'
        and (operation_flow = 'simplified' or production_status = 'ready');
    else
      update public.order_items
      set delivery_status = 'delivered', delivered_at = coalesce(delivered_at, now()), delivered_by = actor_id
      where order_id = target_order.id
        and delivery_status = 'pending'
        and (operation_flow = 'simplified' or production_status = 'ready');
    end if;
    get diagnostics changed_count = row_count;
    if changed_count = 0 then raise exception 'no items are ready for delivery'; end if;

    select count(*) into remaining_count
    from public.order_items
    where order_id = target_order.id and delivery_status not in ('delivered', 'cancelled');
    if remaining_count = 0 then
      update public.orders set status = 'completed' where id = target_order.id;
      next_order_status := 'completed';
    else
      next_order_status := target_order.status::text;
    end if;

  elsif p_action = 'request_closing' then
    if target_session.id is null then raise exception 'table session is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'waiter', 'cashier', 'supervisor']::text[]) then raise exception 'this role cannot request closing'; end if;
    if target_session.status <> 'open' then raise exception 'table is not open'; end if;
    if not exists (select 1 from public.orders o where o.table_session_id = target_session.id and o.status <> 'cancelled') then raise exception 'table has no active orders'; end if;

    update public.table_sessions
    set status = 'awaiting_payment',
        closing_requested_at = now(),
        closing_requested_by = actor_id,
        updated_at = now()
    where id = target_session.id;
    next_order_status := 'awaiting_payment';

  elsif p_action = 'reopen_table' then
    if target_session.id is null then raise exception 'table session is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'cashier', 'supervisor']::text[]) then raise exception 'this role cannot reopen tables'; end if;
    if target_session.status <> 'awaiting_payment' then raise exception 'table is not awaiting payment'; end if;
    if target_session.payment_status = 'paid' then raise exception 'paid table cannot be reopened'; end if;

    update public.table_sessions
    set status = 'open', closing_requested_at = null, closing_requested_by = null, updated_at = now()
    where id = target_session.id;
    next_order_status := 'open';

  elsif p_action = 'confirm_payment' then
    if target_session.id is null then raise exception 'table session is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'cashier', 'supervisor']::text[]) then raise exception 'this role cannot confirm payment'; end if;
    if target_session.status <> 'awaiting_payment' then raise exception 'request table closing before payment'; end if;
    if target_session.payment_status = 'paid' then raise exception 'payment is already confirmed'; end if;
    if normalized_method is null then raise exception 'payment method is required'; end if;

    update public.table_sessions
    set payment_status = 'paid', payment_method = normalized_method,
        payment_confirmed_at = now(), payment_confirmed_by = actor_id, updated_at = now()
    where id = target_session.id;
    update public.orders
    set payment_status = 'paid', billing_status = 'billed', payment_method = normalized_method
    where table_session_id = target_session.id and status <> 'cancelled';
    next_order_status := 'paid';

  elsif p_action = 'release_table' then
    if target_session.id is null then raise exception 'table session is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'cashier', 'supervisor']::text[]) then raise exception 'this role cannot release tables'; end if;
    if target_session.status <> 'awaiting_payment' or target_session.payment_status <> 'paid' then raise exception 'confirm payment before releasing table'; end if;
    if exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.table_session_id = target_session.id
        and o.status <> 'cancelled'
        and oi.delivery_status not in ('delivered', 'cancelled')
    ) then
      raise exception 'confirm delivery of all items before releasing table';
    end if;

    update public.table_sessions
    set status = 'closed', closed_by = actor_id, closed_at = now(), updated_at = now()
    where id = target_session.id;
    next_order_status := 'closed';

  elsif p_action = 'cancel_session' then
    if target_session.id is null then raise exception 'table session is required'; end if;
    if not (actor_roles && array['owner', 'branch_manager', 'supervisor']::text[]) then raise exception 'this role cannot cancel table sessions'; end if;
    update public.orders set status = 'cancelled', billing_status = 'cancelled'
    where table_session_id = target_session.id and status <> 'completed';
    update public.table_sessions
    set status = 'cancelled', closed_by = actor_id, closed_at = now(), updated_at = now()
    where id = target_session.id;
    next_order_status := 'cancelled';
  end if;

  if target_order.id is not null then
    insert into public.order_events (order_id, store_id, event_type, from_value, to_value, actor_user_id, actor_name, metadata)
    values (
      target_order.id, target_store_id, p_action, target_order.status::text, next_order_status,
      actor_id, actor_name,
      jsonb_build_object('item_id', p_item_id, 'table_session_id', p_session_id, 'roles', to_jsonb(actor_roles))
    );
  elsif target_session.id is not null then
    insert into public.order_events (order_id, store_id, event_type, from_value, to_value, actor_user_id, actor_name, metadata)
    select o.id, target_store_id, p_action, target_session.status, next_order_status,
           actor_id, actor_name,
           jsonb_build_object('table_session_id', target_session.id, 'roles', to_jsonb(actor_roles))
    from public.orders o
    where o.table_session_id = target_session.id
    order by o.created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'order_id', p_order_id,
    'item_id', p_item_id,
    'table_session_id', p_session_id,
    'state', next_order_status
  );
end;
$$;

revoke all on function public.run_internal_workflow_action(text, uuid, uuid, uuid, text) from public;
grant execute on function public.run_internal_workflow_action(text, uuid, uuid, uuid, text) to authenticated;

create or replace function public.update_table_session_status(p_session_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status = 'awaiting_payment' then
    return public.run_internal_workflow_action('request_closing', null, null, p_session_id, null);
  elsif p_status = 'open' then
    return public.run_internal_workflow_action('reopen_table', null, null, p_session_id, null);
  elsif p_status = 'closed' then
    return public.run_internal_workflow_action('release_table', null, null, p_session_id, null);
  elsif p_status = 'cancelled' then
    return public.run_internal_workflow_action('cancel_session', null, null, p_session_id, null);
  end if;
  raise exception 'invalid table session status';
end;
$$;

revoke all on function public.update_table_session_status(uuid, text) from public;
grant execute on function public.update_table_session_status(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
      alter publication supabase_realtime add table public.order_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_sessions') then
      alter publication supabase_realtime add table public.table_sessions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_events') then
      alter publication supabase_realtime add table public.order_events;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
