-- On-ice sprint KPIs from 1080's "On-Ice Sprint Profile" exercise (2 kg resisted skating
-- sprints, run as 15-yard and 30-yard reps). One value per athlete per test day:
--
--   on_ice_top_speed  best top speed on a 30-yard rep (mph)
--   on_ice_accel_max  best peak acceleration on any 15- or 30-yard rep (m/s^2)
--   on_ice_15yd_time  fastest 15-yard rep (s)

alter table public.performance_metrics
  add column if not exists on_ice_top_speed numeric,
  add column if not exists on_ice_accel_max numeric,
  add column if not exists on_ice_15yd_time numeric;
