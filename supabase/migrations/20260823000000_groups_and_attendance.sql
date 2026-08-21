-- Groups are a separate tag from location -- any coach (not just admin) can create one and
-- add/remove athletes, and an athlete can be in more than one group at once. Attendance is
-- tracked per (group, athlete, date) so the same athlete's attendance in different groups
-- is independent.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index groups_name_unique on public.groups (lower(trim(name)));

create table public.athlete_groups (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (athlete_id, group_id)
);

create table public.group_attendance (
  group_id uuid not null references public.groups(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  present boolean not null,
  marked_by uuid references public.profiles(id),
  marked_at timestamptz not null default now(),
  primary key (group_id, athlete_id, attendance_date)
);
create index group_attendance_group_date_idx on public.group_attendance (group_id, attendance_date);

alter table public.groups enable row level security;
alter table public.athlete_groups enable row level security;
alter table public.group_attendance enable row level security;

-- Read-only via RLS, same as exercise_library/locations -- all writes go through
-- service-role server actions per this app's established convention.
create policy "groups_select_coach" on public.groups for select using (public.is_coach());
create policy "athlete_groups_select_coach_or_own" on public.athlete_groups
  for select using (public.is_coach() or athlete_id = auth.uid());
create policy "group_attendance_select_coach_or_own" on public.group_attendance
  for select using (public.is_coach() or athlete_id = auth.uid());
