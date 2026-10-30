-- Giving a login to a profile that already exists (admin "Edit Login" on an account that
-- came from imported test data) creates the auth user with the profile's own id. The
-- placeholder insert below then hit profiles_pkey, which the previous ON CONFLICT target
-- (the name-per-role index) didn't cover, so the whole user creation rolled back and the
-- admin saw a bare 500. Skip the insert on any conflict: every caller writes the real
-- profile row itself right after, and an existing profile is exactly the one to keep.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (id, first_name, last_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', 'New'),
    coalesce(new.raw_user_meta_data->>'last_name', 'Athlete'),
    'athlete'
  )
  on conflict do nothing;
  return new;
end;
$function$;
