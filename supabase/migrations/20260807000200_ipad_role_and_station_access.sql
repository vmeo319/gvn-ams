-- Shared weight-room iPad login. Widen role and add an is_station() helper mirroring
-- is_coach()/is_parent_of(), then grant it read access (additive policies only — existing
-- ones are untouched, Postgres ORs multiple permissive SELECT policies together) to
-- exactly what the station view needs: athlete names to search, and the workout data for
-- whichever program each pulled-up athlete is assigned to.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('athlete', 'coach', 'admin', 'parent', 'ipad'));

create or replace function public.is_station()
returns boolean
language sql
security definer
set row_security = off
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ipad'
  );
$$;

create policy "profiles_select_station" on public.profiles for select using (public.is_station());
create policy "workouts_select_station" on public.workouts for select using (public.is_station());
create policy "workout_weeks_select_station" on public.workout_weeks for select using (public.is_station());
create policy "workout_days_select_station" on public.workout_days for select using (public.is_station());
create policy "workout_exercises_select_station" on public.workout_exercises for select using (public.is_station());
create policy "athlete_workout_assignments_select_station" on public.athlete_workout_assignments for select using (public.is_station());
create policy "athlete_workout_history_select_station" on public.athlete_workout_history for select using (public.is_station());
