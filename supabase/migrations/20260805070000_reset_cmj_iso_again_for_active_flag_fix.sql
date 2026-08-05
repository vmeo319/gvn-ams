-- Second reset of these two columns: the first correction (exact CMJ match, tag-based
-- ISO match) missed that Hawkins reps can be marked active:false (invalidated mis-fires
-- in the coach's app) — the sync included them anyway, letting bogus outlier readings
-- (both too high and too low) into the "best of day" aggregation. Also fixed name
-- matching (a whitespace bug corrupting split names, plus nickname equivalence for
-- Nate/Nathan/Nathen, Kenneth/Kenny/Ken, Socrates/Sam) so previously-unmatched athletes'
-- real data starts flowing in. Clearing both columns again so the corrected sync can
-- rebuild them from only valid, correctly-attributed reps.
update public.performance_metrics
set cmj_height_inches = null, iso_belt_squat_peak_force = null
where cmj_height_inches is not null or iso_belt_squat_peak_force is not null;
