-- locations has RLS enabled with zero policies, meaning nobody (not even logged-in
-- coaches) can read it client-side. It's just facility names, not sensitive, so any
-- authenticated user can read the full list.
create policy "locations_select_authenticated"
  on public.locations
  for select
  using (auth.role() = 'authenticated');
