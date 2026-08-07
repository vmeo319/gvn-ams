-- Widen profiles.role to admit 'parent' (real constraint name confirmed via pg_constraint).
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('athlete', 'coach', 'admin', 'parent'));

-- Name-uniqueness was global across all roles (unique_athlete_name), which risks colliding
-- an unrelated parent with an existing athlete/coach of the same name. Scope it per role
-- instead (real index name confirmed via pg_indexes).
drop index public.unique_athlete_name;
create unique index unique_name_per_role on public.profiles
  (lower(trim(first_name)), lower(trim(last_name)), role);

create table public.parent_athlete_links (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, athlete_id)
);
alter table public.parent_athlete_links enable row level security;

create policy "parent_links_select_own_or_coach"
  on public.parent_athlete_links for select
  using (parent_id = auth.uid() or public.is_coach());
-- No client insert/update/delete — links are only created by claimParentInviteAction
-- (service role).

create or replace function public.is_parent_of(target_athlete_id uuid)
returns boolean
language sql
security definer
set row_security = off
stable
as $$
  select exists (
    select 1 from public.parent_athlete_links
    where parent_id = auth.uid() and athlete_id = target_athlete_id
  );
$$;

-- Additive SELECT policies — Postgres ORs multiple permissive policies together, so these
-- sit alongside profiles_select_own_or_coach / metrics_select_own_or_coach unchanged.
create policy "profiles_select_parent_of"
  on public.profiles for select
  using (public.is_parent_of(id));

create policy "metrics_select_parent_of"
  on public.performance_metrics for select
  using (public.is_parent_of(athlete_id));
