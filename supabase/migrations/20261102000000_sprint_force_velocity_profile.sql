-- Off-ice sprint profile from 1080's "Off-Ice Sprint Profiling" (20-yard sprints at 2 kg),
-- one row per athlete per test day, all from that day's fastest 2 kg rep:
--
--   sprint_top_speed  top speed (mph)
--   sprint_f0         theoretical max horizontal force (N/kg)
--   sprint_v0         theoretical max speed (mph) -- not the same as the older v0_speed,
--                     which comes from a speed-vs-load line across reps
--   sprint_rfmax      max ratio of horizontal to total ground force (%)
--   sprint_pmax       max horizontal power (W/kg)
--
-- F0/V0/RFmax/Pmax are computed in sync-1080 from the rep's speed samples (Samozino method)
-- and need the athlete's bodyweight; without one only sprint_top_speed is stored.

alter table public.performance_metrics
  add column if not exists sprint_top_speed numeric,
  add column if not exists sprint_f0 numeric,
  add column if not exists sprint_v0 numeric,
  add column if not exists sprint_rfmax numeric,
  add column if not exists sprint_pmax numeric;
