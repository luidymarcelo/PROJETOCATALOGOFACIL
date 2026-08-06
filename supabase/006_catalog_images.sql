-- Imagens publicas do catalogo, organizadas pelo ID da filial.
alter table public.stores
  add column if not exists cover_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company members update own stores" on public.stores;
create policy "company members update own stores"
  on public.stores for update
  using (public.can_manage_store(id))
  with check (public.can_manage_store(id));

drop policy if exists "public can view catalog images" on storage.objects;
create policy "public can view catalog images"
  on storage.objects for select
  using (bucket_id = 'catalog-images');

drop policy if exists "store members upload catalog images" on storage.objects;
create policy "store members upload catalog images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'catalog-images'
    and exists (
      select 1
      from public.stores s
      where s.id::text = (storage.foldername(name))[1]
        and public.can_manage_store(s.id)
    )
  );

drop policy if exists "store members update catalog images" on storage.objects;
create policy "store members update catalog images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and exists (
      select 1
      from public.stores s
      where s.id::text = (storage.foldername(name))[1]
        and public.can_manage_store(s.id)
    )
  )
  with check (
    bucket_id = 'catalog-images'
    and exists (
      select 1
      from public.stores s
      where s.id::text = (storage.foldername(name))[1]
        and public.can_manage_store(s.id)
    )
  );

drop policy if exists "store members delete catalog images" on storage.objects;
create policy "store members delete catalog images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and exists (
      select 1
      from public.stores s
      where s.id::text = (storage.foldername(name))[1]
        and public.can_manage_store(s.id)
    )
  );
