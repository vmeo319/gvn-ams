-- Self-serve signup now goes through coach review instead of instant name-matched claiming.
-- The queue is just profiles.role = 'pending' — no separate table, same pattern as reusing
-- existing tables for state elsewhere in this app (e.g. athlete_workout_history's open/closed
-- rows). email is added so the coach review list can show it without an admin-API round trip
-- per pending profile.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('athlete', 'coach', 'admin', 'parent', 'ipad', 'pending'));

alter table public.profiles add column if not exists email text;
