-- Coach-facing dated log of notes/injuries/goals per athlete. Append-only by design
-- (no update/delete policy or UI) so the log stays a real running history.
create table public.athlete_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  entry_type text not null check (entry_type in ('note', 'injury', 'goal')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index athlete_notes_athlete_id_created_at_idx
  on public.athlete_notes (athlete_id, created_at desc);

alter table public.athlete_notes enable row level security;

create policy "athlete_notes_select_coach"
  on public.athlete_notes for select
  using (public.is_coach());
-- No insert/update/delete policy — writes only via addAthleteNoteAction (service role).
