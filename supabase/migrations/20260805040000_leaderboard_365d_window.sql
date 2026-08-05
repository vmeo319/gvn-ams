-- Despite its name, coach_365d_leaderboard never actually filtered by date — it took the
-- all-time max of every metric. The athlete's own trend page intentionally shows full
-- history (no change needed there), but the coach dashboard's leaderboard should only
-- reflect the past 365 days. Filtering inside the join condition (not a WHERE clause)
-- so athletes with no recent data still appear, just with nulls, matching existing
-- dash-for-missing-value display behavior.
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
left join public.performance_metrics m
  on m.athlete_id = p.id and m.test_date >= (current_date - interval '365 days')
group by p.id, p.first_name, p.last_name, p.birth_year, p.position, p.height_inches, p.weight_lbs, l.name;
