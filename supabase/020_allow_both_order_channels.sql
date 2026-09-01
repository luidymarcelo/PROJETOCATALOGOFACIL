create or replace function public.create_internal_order(
  p_store_id uuid,
  p_customer_name text,
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
  v_order_id uuid;
  v_order_code text;
  v_item jsonb;
  v_product record;
  v_options jsonb;
  v_option jsonb;
  v_option_delta numeric;
  v_quantity numeric;
  v_options_total numeric;
  v_unit_price numeric;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := coalesce(p_delivery_fee, 0);
begin
  if nullif(trim(p_customer_name), '') is null then
    raise exception 'customer name is required';
  end if;

  if p_fulfillment_mode not in ('delivery', 'pickup') then
    raise exception 'invalid fulfillment mode';
  end if;

  if v_delivery_fee < 0 then
    raise exception 'delivery fee cannot be negative';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required';
  end if;

  select s.tenant_id
    into v_tenant_id
    from public.stores s
   where s.id = p_store_id
     and s.is_active = true;

  if v_tenant_id is null then
    raise exception 'store is not available';
  end if;

  select coalesce(
    (select sp.parameter_value #>> '{}'
       from public.store_parameters sp
      where sp.store_id = p_store_id
        and sp.parameter_key = 'order_mode'),
    (select tp.parameter_value #>> '{}'
       from public.tenant_parameters tp
      where tp.tenant_id = v_tenant_id
        and tp.parameter_key = 'order_mode'),
    'whatsapp'
  )
    into v_order_mode;

  if v_order_mode not in ('internal', 'both') then
    raise exception 'internal orders are disabled for this store';
  end if;

  insert into public.orders (
    store_id,
    status,
    order_channel,
    fulfillment_mode,
    customer_name,
    delivery_address,
    customer_reference,
    service_location,
    customer_latitude,
    customer_longitude,
    payment_method,
    change_for,
    notes,
    delivery_fee
  ) values (
    p_store_id,
    'accepted',
    'internal',
    p_fulfillment_mode,
    trim(p_customer_name),
    nullif(trim(p_delivery_address), ''),
    nullif(trim(p_reference), ''),
    nullif(trim(p_service_location), ''),
    p_latitude,
    p_longitude,
    nullif(trim(p_payment_method), ''),
    p_change_for,
    nullif(trim(p_notes), ''),
    v_delivery_fee
  )
  returning id, order_code into v_order_id, v_order_code;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item->>'product_id', '') is null then
      raise exception 'product id is required';
    end if;

    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    if v_quantity <= 0 or v_quantity > 999 then
      raise exception 'invalid item quantity';
    end if;

    select p.id, p.name, p.price
      into v_product
      from public.products p
     where p.id = (v_item->>'product_id')::uuid
       and p.store_id = p_store_id
       and p.is_active = true;

    if not found then
      raise exception 'product is not available';
    end if;

    v_options := case
      when jsonb_typeof(v_item->'selected_options') = 'array' then v_item->'selected_options'
      else '[]'::jsonb
    end;

    v_options_total := 0;
    for v_option in select value from jsonb_array_elements(v_options)
    loop
      v_option_delta := null;
      select ogi.price_delta
        into v_option_delta
        from public.option_group_items ogi
        join public.option_groups og on og.id = ogi.group_id
        join public.product_option_groups pog on pog.group_id = og.id
       where ogi.id = (v_option->>'item_id')::uuid
         and ogi.is_active = true
         and og.is_active = true
         and pog.product_id = v_product.id;

      if v_option_delta is null then
        raise exception 'selected addition is not available for this product';
      end if;
      v_options_total := v_options_total + v_option_delta;
    end loop;

    v_unit_price := round((v_product.price + v_options_total)::numeric, 2);
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      total,
      selected_options
    ) values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_unit_price,
      v_quantity,
      round((v_unit_price * v_quantity)::numeric, 2),
      v_options
    );
  end loop;

  update public.orders
     set subtotal = round(v_subtotal::numeric, 2),
         total = round((v_subtotal + v_delivery_fee)::numeric, 2)
   where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'subtotal', round(v_subtotal::numeric, 2),
    'delivery_fee', round(v_delivery_fee::numeric, 2),
    'total', round((v_subtotal + v_delivery_fee)::numeric, 2)
  );
end;
$$;

revoke all on function public.create_internal_order(
  uuid, text, text, text, text, text, text, numeric, text, numeric, numeric, numeric, jsonb
) from public;
grant execute on function public.create_internal_order(
  uuid, text, text, text, text, text, text, numeric, text, numeric, numeric, numeric, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
