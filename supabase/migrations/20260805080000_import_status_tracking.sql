-- Tracks the last successful import per data source, and whether it was triggered
-- automatically (the sync-hawkins/sync-1080 cron jobs) or manually (a coach uploading a
-- file from the coach dashboard), so the Import Data menu can show "last imported" info.
create table if not exists public.import_status (
  source text primary key check (source in ('hawkins', '1080', 'excel')),
  last_imported_at timestamptz not null default now(),
  triggered_by text not null check (triggered_by in ('auto', 'manual')),
  records_count integer
);

alter table public.import_status enable row level security;

create policy "import_status_select_coach"
  on public.import_status
  for select
  using (public.is_coach());

-- The 1080 CSV import runs entirely client-side (not a server action), so it needs to
-- write this row directly using the coach's own session rather than the service role.
create policy "import_status_upsert_coach"
  on public.import_status
  for insert
  with check (public.is_coach());

create policy "import_status_update_coach"
  on public.import_status
  for update
  using (public.is_coach())
  with check (public.is_coach());
