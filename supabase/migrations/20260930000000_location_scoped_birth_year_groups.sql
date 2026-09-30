-- Groups now belong to a location. An athlete can only be in groups at locations they train
-- at (profiles.location_id plus any extras in athlete_locations), and every location gets an
-- automatic group per birth year (2004 and younger) that athletes are placed into by the DB
-- itself -- so it stays right no matter which path edits a birth year or location (admin
-- page, add-athlete form, signup claims, imports).

alter table public.groups add column location_id uuid references public.locations(id) on delete cascade;
-- Set only on the auto-managed birth-year groups; null for coach-created groups.
alter table public.groups add column birth_year int;

-- No groups existed when this shipped, but any stragglers default to Chicago rather than
-- blocking the not-null.
update public.groups set location_id = '11111111-1111-1111-1111-111111111111' where location_id is null;
alter table public.groups alter column location_id set not null;

drop index public.groups_name_unique;
create unique index groups_location_name_unique on public.groups (location_id, lower(trim(name)));
create unique index groups_location_birth_year_unique on public.groups (location_id, birth_year)
  where birth_year is not null;

create or replace function public.athlete_location_ids(p_profile uuid)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select location_id from public.profiles where id = p_profile and location_id is not null
  union
  select location_id from public.athlete_locations where profile_id = p_profile
$$;

create or replace function public.sync_athlete_groups(p_profile uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.profiles%rowtype;
  target_year int;
begin
  select * into r from public.profiles where id = p_profile;
  if not found then return; end if;

  target_year := case when r.role = 'athlete' and r.birth_year >= 2004 then r.birth_year end;

  -- Out of any group at a location they no longer train at, and out of any birth-year group
  -- that isn't theirs anymore. Coach-made groups at their current locations are untouched.
  delete from public.athlete_groups ag
  using public.groups g
  where ag.group_id = g.id
    and ag.athlete_id = p_profile
    and (
      g.location_id not in (select public.athlete_location_ids(p_profile))
      or (g.birth_year is not null and g.birth_year is distinct from target_year)
    );

  if target_year is null then return; end if;

  -- A coach may have already hand-made a group named e.g. "2009" at this location -- adopt it
  -- as the birth-year group rather than colliding with it on the name index.
  update public.groups g
  set birth_year = target_year
  where g.birth_year is null
    and lower(trim(g.name)) = target_year::text
    and g.location_id in (select public.athlete_location_ids(p_profile))
    and not exists (
      select 1 from public.groups g2 where g2.location_id = g.location_id and g2.birth_year = target_year
    );

  insert into public.groups (name, location_id, birth_year)
  select target_year::text, l, target_year
  from public.athlete_location_ids(p_profile) l
  on conflict do nothing;

  insert into public.athlete_groups (athlete_id, group_id)
  select p_profile, g.id
  from public.groups g
  where g.birth_year = target_year
    and g.location_id in (select public.athlete_location_ids(p_profile))
  on conflict do nothing;
end;
$$;

create or replace function public.profiles_sync_groups_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_athlete_groups(new.id);
  return new;
end;
$$;

create trigger profiles_sync_groups
after insert or update of birth_year, location_id, role on public.profiles
for each row execute function public.profiles_sync_groups_trigger();

create or replace function public.athlete_locations_sync_groups_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.sync_athlete_groups(coalesce(new.profile_id, old.profile_id));
  return null;
end;
$$;

create trigger athlete_locations_sync_groups
after insert or delete on public.athlete_locations
for each row execute function public.athlete_locations_sync_groups_trigger();

-- Hard guard for manual adds: the group must be at one of the athlete's locations.
create or replace function public.athlete_groups_location_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.groups g
    where g.id = new.group_id
      and g.location_id in (select public.athlete_location_ids(new.athlete_id))
  ) then
    raise exception 'This athlete does not train at that group''s location.';
  end if;
  return new;
end;
$$;

create trigger athlete_groups_location_check
before insert or update on public.athlete_groups
for each row execute function public.athlete_groups_location_check();

-- Security-definer helpers are only for the triggers above, not callable over PostgREST RPC.
revoke execute on function public.athlete_location_ids(uuid) from public, anon, authenticated;
revoke execute on function public.sync_athlete_groups(uuid) from public, anon, authenticated;

-- Backfill: create each location's birth-year groups and place every current athlete.
select public.sync_athlete_groups(id) from public.profiles where role = 'athlete';
