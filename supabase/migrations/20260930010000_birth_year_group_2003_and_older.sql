-- Athletes born 2003 or earlier share one "2003+" group per location instead of one group per
-- year. Only athletes with a known birth year of 2003 or before are placed there -- no birth
-- year still means no birth-year group. The bucket is stored as birth_year = 2003 so it keeps
-- the existing one-birth-year-group-per-location uniqueness and sync logic.

create or replace function public.sync_athlete_groups(p_profile uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.profiles%rowtype;
  target_year int;
  target_name text;
begin
  select * into r from public.profiles where id = p_profile;
  if not found then return; end if;

  target_year := case
    when r.role <> 'athlete' or r.birth_year is null then null
    when r.birth_year <= 2003 then 2003
    else r.birth_year
  end;
  target_name := case when target_year = 2003 then '2003+' else target_year::text end;

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

  -- A coach may have already hand-made a group with this name at this location -- adopt it
  -- as the birth-year group rather than colliding with it on the name index.
  update public.groups g
  set birth_year = target_year
  where g.birth_year is null
    and lower(trim(g.name)) = target_name
    and g.location_id in (select public.athlete_location_ids(p_profile))
    and not exists (
      select 1 from public.groups g2 where g2.location_id = g.location_id and g2.birth_year = target_year
    );

  insert into public.groups (name, location_id, birth_year)
  select target_name, l, target_year
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

revoke execute on function public.sync_athlete_groups(uuid) from public, anon, authenticated;

-- Place everyone already known to be born 2003 or earlier.
select public.sync_athlete_groups(id) from public.profiles where role = 'athlete' and birth_year <= 2003;
