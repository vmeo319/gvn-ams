-- Scopes the exercise library per GVN location, so North Shore's naming conventions don't
-- pollute Chicago's autocomplete/bank and vice versa. Table is currently empty (0 rows),
-- so location_id can be added as NOT NULL outright — no backfill needed.
--
-- name_key is a real stored column (not the old lower(trim(name)) expression index) so
-- PostgREST's upsert onConflict can target it with plain column-name syntax.
drop index if exists public.exercise_library_name_unique;

alter table public.exercise_library
  add column location_id uuid not null references public.locations(id),
  add column name_key text generated always as (lower(trim(name))) stored;

create unique index exercise_library_location_name_key_unique
  on public.exercise_library (location_id, name_key);

-- Reverse lookup for the new Exercise Bank tab's "used in these programs" list.
-- workout_exercises.exercise_name is free text with no FK to exercise_library, so this
-- matches by name text — consistent with how exercise_library itself dedupes exercises.
create or replace view public.workout_exercise_usage as
select
  lower(trim(we.exercise_name)) as exercise_name_key,
  w.id as workout_id,
  w.name as workout_name,
  w.status as workout_status
from public.workout_exercises we
join public.workout_days wd on wd.id = we.day_id
join public.workout_weeks ww on ww.id = wd.week_id
join public.workouts w on w.id = ww.workout_id
group by lower(trim(we.exercise_name)), w.id, w.name, w.status;
