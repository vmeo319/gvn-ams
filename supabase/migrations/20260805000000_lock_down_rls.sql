-- profiles and performance_metrics currently have RLS disabled entirely, meaning the
-- public anon key can read (and would be able to write) every athlete's data with no
-- restriction. This locks reads down to "your own row" for athletes, "everything" for
-- coach/admin, and leaves all writes to the service-role key (used by server actions).

create or replace function public.is_coach()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coach', 'admin')
  );
$$;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_coach"
  on public.profiles
  for select
  using (id = auth.uid() or public.is_coach());

create policy "profiles_update_own"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.performance_metrics enable row level security;

create policy "metrics_select_own_or_coach"
  on public.performance_metrics
  for select
  using (athlete_id = auth.uid() or public.is_coach());

-- Internal sync queue: no client (anon/authenticated) access at all, service role only.
alter table public.ten80_sync_queue enable row level security;

-- The leaderboard view previously ran as its owner (bypassing RLS entirely). This makes
-- it run as the querying user instead, so the policies above actually apply to it.
alter view public.coach_365d_leaderboard set (security_invoker = true);
