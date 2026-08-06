-- Corrige a autorizacao do Storage e centraliza a atualizacao da capa.
create or replace function public.can_manage_catalog_image(object_name text)
returns boolean
language sql
security definer
set search_path = public, storage
stable
as $$
  select exists (
    select 1
    from public.stores s
    where s.id::text = split_part(object_name, '/', 1)
      and public.can_manage_store(s.id)
  );
$$;

revoke all on function public.can_manage_catalog_image(text) from public;
grant execute on function public.can_manage_catalog_image(text) to authenticated;

drop policy if exists "store members upload catalog images" on storage.objects;
create policy "store members upload catalog images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_image(name)
  );

drop policy if exists "store members update catalog images" on storage.objects;
create policy "store members update catalog images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_image(name)
  )
  with check (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_image(name)
  );

drop policy if exists "store members delete catalog images" on storage.objects;
create policy "store members delete catalog images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_image(name)
  );

create or replace function public.set_store_cover(
  target_store_id uuid,
  new_cover_image_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_manage_store(target_store_id) then
    raise exception 'not authorized to manage this store' using errcode = '42501';
  end if;

  update public.stores
  set cover_image_url = nullif(trim(new_cover_image_url), '')
  where id = target_store_id;

  if not found then
    raise exception 'store not found';
  end if;
end;
$$;

revoke all on function public.set_store_cover(uuid, text) from public;
grant execute on function public.set_store_cover(uuid, text) to authenticated;
