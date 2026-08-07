-- Parent-invite tokens. Decoupled from Supabase Auth's admin.generateLink({type:'invite'}),
-- which provisions the auth.users row at generation time and only supports a single
-- one-time claim — unworkable for a parent claiming a second invite for a second child
-- while already having an account. A plain token table lets claiming attach to either an
-- existing session or a freshly created one.
create table public.parent_invites (
  token uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  email text,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);
create index parent_invites_athlete_id_idx on public.parent_invites (athlete_id);

alter table public.parent_invites enable row level security;
-- RLS enabled, zero policies = zero client access. Every read/write goes through
-- service-role server actions (getParentInviteInfoAction, createParentInviteAction,
-- claimParentInviteAction), matching the lockdown pattern already used elsewhere in this app.
