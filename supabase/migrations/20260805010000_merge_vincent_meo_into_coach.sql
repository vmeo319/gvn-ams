-- Merges the orphaned "Vincent Meo" athlete profile (the coach's own historical test
-- data, predating this login system) into the coach's real login
-- (05373f56-4d5f-4f54-8402-4cfa81ee783f), so "Athlete View" can show it under the
-- coach's own session. Order matters: metrics move off the orphan row before it's
-- deleted (learned the hard way earlier this session — deleting a profiles row
-- cascades and destroys its performance_metrics if they haven't been moved first).
-- A new "GVN-Coaches" location keeps this profile out of athlete leaderboards.

insert into public.locations (name) values ('GVN-Coaches')
on conflict do nothing;

update public.performance_metrics
set athlete_id = '05373f56-4d5f-4f54-8402-4cfa81ee783f'
where athlete_id = 'c841a008-efcf-49b9-a23c-f841fd3f5532';

delete from public.profiles where id = 'c841a008-efcf-49b9-a23c-f841fd3f5532';

update public.profiles
set
  first_name = 'Vincent',
  last_name = 'Meo',
  location_id = (select id from public.locations where name = 'GVN-Coaches')
where id = '05373f56-4d5f-4f54-8402-4cfa81ee783f';
