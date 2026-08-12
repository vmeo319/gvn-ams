-- Top-set logging: what an athlete actually lifted for a specific prescribed exercise
-- instance (a workout_exercises row), as opposed to workout_exercises.sets/reps/tempo
-- which are free-text prescription notation. Entered from the iPad station.
create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  reps int not null check (reps > 0),
  weight_lbs numeric not null check (weight_lbs >= 0),
  est_1rm numeric generated always as (round(weight_lbs * (1 + reps::numeric / 30), 1)) stored,
  notes text,
  logged_at timestamptz not null default now(),
  logged_by uuid references public.profiles(id)
);
create index exercise_logs_athlete_idx on public.exercise_logs (athlete_id, logged_at desc);
create index exercise_logs_workout_exercise_idx on public.exercise_logs (workout_exercise_id);

alter table public.exercise_logs enable row level security;
create policy "exercise_logs_select_coach_station_or_own" on public.exercise_logs
  for select using (public.is_coach() or public.is_station() or athlete_id = auth.uid());
-- No client insert/update/delete — writes only via logExerciseSet (service role), matching
-- this app's existing convention.

-- Recent-history lookups need the exercise name, which lives on workout_exercises, not the
-- log itself — same pattern as athlete_current_workout.
create view public.athlete_exercise_logs as
  select el.id, el.athlete_id, el.reps, el.weight_lbs, el.est_1rm, el.notes, el.logged_at,
         we.exercise_name, we.day_id, el.workout_exercise_id
  from public.exercise_logs el
  join public.workout_exercises we on we.id = el.workout_exercise_id;
