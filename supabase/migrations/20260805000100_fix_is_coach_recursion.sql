-- is_coach() being SECURITY DEFINER wasn't enough to avoid RLS's same-table recursion
-- guard when called from within a policy on profiles itself. Explicitly disabling RLS
-- for the duration of this function's own internal query fixes it.
create or replace function public.is_coach()
returns boolean
language sql
security definer
set row_security = off
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('coach', 'admin')
  );
$$;
