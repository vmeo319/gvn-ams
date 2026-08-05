-- The view previously hardcoded `NULL::text AS location`, so even with location_id
-- now properly wired up on profiles, the coach dashboard would never actually show or
-- filter by real location data. Join through locations instead.
create or replace view public.coach_365d_leaderboard
with (security_invoker = true) as
select
  p.id as athlete_id,
  p.first_name,
  p.last_name,
  p.birth_year,
  p.position,
  p.height_inches,
  p.weight_lbs,
  l.name as location,
  max(m.iso_belt_squat_peak_force) as iso_rel_peak_force,
  max(m.v0_speed) as v0_speed,
  max(m.top_speed) as top_speed,
  max(m.cmj_height_inches) as max_jump,
  case when max(m.iso_belt_squat_peak_force) >= 80 then 'Level 3' else 'Level 1+2' end as workout_level,
  'Level 1' as sprint_level
from public.profiles p
left join public.locations l on l.id = p.location_id
left join public.performance_metrics m on m.athlete_id = p.id
group by p.id, p.first_name, p.last_name, p.birth_year, p.position, p.height_inches, p.weight_lbs, l.name;
