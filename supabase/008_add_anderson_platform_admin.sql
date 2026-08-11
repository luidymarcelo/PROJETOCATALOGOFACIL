-- Execute no SQL Editor depois de criar este e-mail em Authentication > Users.
do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where lower(trim(email)) = 'andersonrozwot@gmail.com'
  limit 1;

  if target_user_id is null then
    raise exception 'Usuario andersonrozwot@gmail.com nao encontrado em Authentication > Users.';
  end if;

  insert into public.platform_admins (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end;
$$;

select
  users.email,
  admins.created_at
from public.platform_admins admins
join auth.users users on users.id = admins.user_id
where lower(trim(users.email)) = 'andersonrozwot@gmail.com';
