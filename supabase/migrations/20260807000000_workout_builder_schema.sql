-- Workout programming: programs (workouts) -> weeks -> days -> exercises, plus a small
-- searchable exercise library. All writes go through server actions using the service-role
-- key (this app's existing convention), so client-facing RLS is select-only for coaches.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index workouts_name_unique on public.workouts (lower(trim(name)));

create table public.workout_weeks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  week_number int not null,
  unique (workout_id, week_number)
);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.workout_weeks(id) on delete cascade,
  day_number int not null,
  name text not null,
  unique (week_id, day_number)
);

-- One row per exercise. block_label + block_sub_index combine for display ("B2").
-- sort_order controls the day's overall row order.
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workout_days(id) on delete cascade,
  block_label text not null,
  block_sub_index int not null default 1,
  sort_order int not null,
  exercise_name text not null,
  sets text,
  reps text,
  tempo text,
  notes text
);
create index workout_exercises_day_id_idx on public.workout_exercises (day_id);

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index exercise_library_name_unique on public.exercise_library (lower(trim(name)));

-- One row per athlete = their current program.
create table public.athlete_workout_assignments (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id),
  assigned_at date not null default current_date,
  assigned_by uuid references public.profiles(id)
);

-- One open row (ended_on is null) per athlete at a time, closed out on reassignment.
create table public.athlete_workout_history (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid not null references public.workouts(id),
  started_on date not null default current_date,
  ended_on date,
  weeks_completed int not null default 0
);
create index athlete_workout_history_athlete_idx on public.athlete_workout_history (athlete_id, started_on desc);

-- Coach-facing merge of assignment + open history row + workout name, for dashboard/detail views.
create view public.athlete_current_workout as
  select a.athlete_id, w.id as workout_id, w.name as workout_name, h.weeks_completed, h.started_on
  from public.athlete_workout_assignments a
  join public.workouts w on w.id = a.workout_id
  left join public.athlete_workout_history h on h.athlete_id = a.athlete_id and h.ended_on is null;

alter table public.workouts enable row level security;
alter table public.workout_weeks enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercise_library enable row level security;
alter table public.athlete_workout_assignments enable row level security;
alter table public.athlete_workout_history enable row level security;

create policy "workouts_select_coach" on public.workouts for select using (public.is_coach());
create policy "workout_weeks_select_coach" on public.workout_weeks for select using (public.is_coach());
create policy "workout_days_select_coach" on public.workout_days for select using (public.is_coach());
create policy "workout_exercises_select_coach" on public.workout_exercises for select using (public.is_coach());
create policy "exercise_library_select_coach" on public.exercise_library for select using (public.is_coach());
create policy "athlete_workout_assignments_select_coach_or_own"
  on public.athlete_workout_assignments for select using (public.is_coach() or athlete_id = auth.uid());
create policy "athlete_workout_history_select_coach_or_own"
  on public.athlete_workout_history for select using (public.is_coach() or athlete_id = auth.uid());
