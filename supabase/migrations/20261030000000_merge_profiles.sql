-- Merges one profile into another so a duplicate account can be removed without losing its
-- data (deleting a profiles row cascades and destroys everything that points at it).
--
-- Every column with a foreign key to profiles(id) is repointed from p_from to p_into, found
-- from the catalog so tables added later are covered too. A row that can't move -- it would
-- duplicate one p_into already has (same group, same attendance day...) or a trigger rejects
-- it (e.g. a group at a location p_into doesn't train at) -- is dropped. performance_metrics
-- is merged column by column first: on a date both accounts tested, p_into keeps its own
-- readings and takes p_from's only where it has none.
--
-- Leaves the p_from profile and its auth login in place; the caller deletes both after.

create or replace function public.merge_profile_into(p_from uuid, p_into uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  fk record;
  r record;
  metric_cols text;
  moved int := 0;
  dropped int := 0;
begin
  if p_from = p_into then raise exception 'Cannot merge an account into itself.'; end if;
  if not exists (select 1 from profiles where id = p_from) then raise exception 'Account to merge not found.'; end if;
  if not exists (select 1 from profiles where id = p_into) then raise exception 'Account to keep not found.'; end if;

  -- Fill gaps on the kept profile first, so location-scoped rows (groups) can follow.
  update profiles t set
    birth_year = coalesce(t.birth_year, f.birth_year),
    location_id = coalesce(t.location_id, f.location_id),
    weight_lbs = coalesce(t.weight_lbs, f.weight_lbs),
    email = coalesce(t.email, f.email)
  from profiles f
  where t.id = p_into and f.id = p_from;

  -- Same-date test results: keep p_into's values, fill its blanks from p_from.
  select string_agg(format('%1$I = coalesce(t.%1$I, f.%1$I)', column_name), ', ')
  into metric_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'performance_metrics'
    and column_name not in ('id', 'athlete_id', 'test_date', 'location_id', 'created_at');
  execute format(
    'update performance_metrics t set %s from performance_metrics f
     where t.athlete_id = $2 and f.athlete_id = $1 and f.test_date = t.test_date',
    metric_cols
  ) using p_from, p_into;

  -- athlete_locations before everything else, so group memberships at those locations pass
  -- the location check when they move.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1
    order by (c.conrelid = 'public.athlete_locations'::regclass) desc, c.conrelid::regclass::text
  loop
    for r in execute format('select ctid from %s where %I = $1', fk.tbl, fk.col) using p_from loop
      begin
        execute format('update %s set %I = $1 where ctid = $2', fk.tbl, fk.col) using p_into, r.ctid;
        moved := moved + 1;
      exception when unique_violation or raise_exception then
        execute format('delete from %s where ctid = $1', fk.tbl) using r.ctid;
        dropped := dropped + 1;
      end;
    end loop;
  end loop;

  return jsonb_build_object('moved', moved, 'dropped', dropped);
end;
$$;

revoke execute on function public.merge_profile_into(uuid, uuid) from public, anon, authenticated;
