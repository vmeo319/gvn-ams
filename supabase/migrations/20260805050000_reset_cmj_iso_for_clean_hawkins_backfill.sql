-- sync-hawkins matched CMJ too loosely (catching "Countermovement Jump-training" and
-- "...-SL Land- L/R" variants, inflating recorded max height) and extracted ISO force by
-- scanning for the first key containing "force"/"peak"/"rel" in whatever order the API
-- happened to return them — very often landing on a "Relative Force at N ms (BW)(N/kg)"
-- sub-metric (commonly 100-130) instead of the real "Relative Peak Force (BW)(N/kg)"
-- (e.g. ~56), producing values well above the real ~100 N/kg gym record. Clearing both
-- columns so the corrected sync (exact CMJ match, tag-based ISO Belt Squat - 45 match,
-- exact canonical force field) can rebuild them cleanly.
update public.performance_metrics
set cmj_height_inches = null, iso_belt_squat_peak_force = null
where cmj_height_inches is not null or iso_belt_squat_peak_force is not null;
