-- CMJ force-plate detail beyond jump height, so program tracks can be compared on how athletes
-- jump, not just how high. All values come from the same rep as that day's cmj_height_inches
-- (the athlete's best jump of the day), so the forces, phases and impulse ratio on a row always
-- describe one real jump rather than a mix of reps.
--
--   cmj_peak_rel_prop_power   Peak Relative Propulsive Power (W/kg)
--   cmj_avg_rel_braking_force Avg. Relative Braking Force (% bodyweight)
--   cmj_avg_rel_prop_force    Avg. Relative Propulsive Force (% bodyweight)
--   cmj_impulse_ratio         Impulse Ratio (propulsive net impulse / braking net impulse)
--   cmj_braking_phase_s       Braking Phase duration (s)
--   cmj_propulsive_phase_s    Propulsive Phase duration (s)
--
-- Existing rows get filled by re-running sync-hawkins with a large lookbackDays.

alter table public.performance_metrics
  add column if not exists cmj_peak_rel_prop_power numeric,
  add column if not exists cmj_avg_rel_braking_force numeric,
  add column if not exists cmj_avg_rel_prop_force numeric,
  add column if not exists cmj_impulse_ratio numeric,
  add column if not exists cmj_braking_phase_s numeric,
  add column if not exists cmj_propulsive_phase_s numeric;
