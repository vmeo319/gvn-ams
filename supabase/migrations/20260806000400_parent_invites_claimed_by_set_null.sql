-- claimed_by referenced auth.users(id) with no cascade behavior, so deleting a parent's
-- account (e.g. removing a stale/mock account, or via the admin API, which performs this
-- delete internally) always failed with a foreign-key violation once they'd claimed an
-- invite. The invite row itself is worth keeping for history — just let claimed_by go null
-- rather than blocking the delete.
alter table public.parent_invites drop constraint parent_invites_claimed_by_fkey;
alter table public.parent_invites add constraint parent_invites_claimed_by_fkey
  foreign key (claimed_by) references auth.users(id) on delete set null;
