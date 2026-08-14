-- Some athletes train at more than one GVN facility. profiles.location_id stays as the
-- athlete's primary location (everything else in the app — dashboard filtering, the
-- leaderboard view, report cards — keeps reading that single column, unchanged), and this
-- join table additionally tracks every location an athlete trains at, editable from the
-- new admin page.
create table public.athlete_locations (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (profile_id, location_id)
);

alter table public.athlete_locations enable row level security;

create policy "athlete_locations_select" on public.athlete_locations
  for select using (profile_id = auth.uid() or public.is_coach());

create policy "athlete_locations_write" on public.athlete_locations
  for all using (public.is_coach()) with check (public.is_coach());
