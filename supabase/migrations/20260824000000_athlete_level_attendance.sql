-- Attendance turned out to always apply to the whole athlete, not a specific group -- marking
-- someone present in one group already needs to show up in every other group they belong to,
-- which under the old per-(group, athlete, date) table meant duplicating the same fact once per
-- membership and keeping the copies in sync by hand. That app-level cascade was the actual
-- source of the cross-group bugs reported after the first attendance pass. Moving to one row
-- per (athlete, date) makes that consistency structural -- there's nothing left to keep in
-- sync -- and it lets an athlete with zero group memberships still have attendance taken
-- directly from their own coach-view profile.
create table public.athlete_attendance (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  present boolean not null default true,
  marked_by uuid references public.profiles(id),
  marked_at timestamptz not null default now(),
  primary key (athlete_id, attendance_date)
);
create index athlete_attendance_date_idx on public.athlete_attendance (attendance_date);

alter table public.athlete_attendance enable row level security;
create policy "athlete_attendance_select_coach_or_own" on public.athlete_attendance
  for select using (public.is_coach() or athlete_id = auth.uid());

-- Backfill from the old per-group table: an athlete counts as present on a date if any of
-- their groups had them marked present that date.
insert into public.athlete_attendance (athlete_id, attendance_date, present, marked_by, marked_at)
select athlete_id, attendance_date, true, marked_by, marked_at
from public.group_attendance
where present = true
on conflict (athlete_id, attendance_date) do nothing;

-- group_attendance is superseded by athlete_attendance and the app no longer writes to it, but
-- it's left in place (not dropped) since it still holds historical per-group marked_by
-- attribution that the new table doesn't carry forward.
