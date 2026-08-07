-- handle_new_user() always inserts role='athlete' as a placeholder, regardless of what
-- the new account's real role will end up being (an athlete invite claim, a self-serve
-- athlete signup, or now a parent-invite claim). Because it runs inside the same
-- transaction as the auth.users insert, a name collision against unique_name_per_role
-- previously rolled back user creation entirely — discovered via parent-invite signups,
-- where the trigger's transient 'athlete' default collided with unrelated same-named
-- profiles before the app ever got a chance to set the real role. Degrade to a no-op on
-- conflict instead: the caller (upsertAthleteAction's invite flow, claimAthleteAccount,
-- claimParentInviteAction) always does its own upsert on the real id right after, which
-- creates or corrects the row regardless of whether this trigger's insert landed.
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
  on conflict (lower(trim(first_name)), lower(trim(last_name)), role) do nothing;
  return new;
end;
$function$;
