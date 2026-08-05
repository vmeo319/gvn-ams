-- The locations table had exactly one row ("GVN Chicago", no dash) that didn't match
-- any of the 4 facility names the coach dashboard's location filter/dropdown actually
-- uses. Renaming that row to match and adding the other 3 so profiles.location_id can
-- be wired up for real.
update public.locations set name = 'GVN- Chicago' where id = '11111111-1111-1111-1111-111111111111';

insert into public.locations (name) values
  ('GVN- North Shore'),
  ('GVN- Michigan'),
  ('GVN- FVIA')
on conflict do nothing;
