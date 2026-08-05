-- 200 of 204 existing rows with both v0_speed and top_speed set are exactly equal —
-- a near-certain fingerprint of the old sync-1080 bug (client-session mis-attribution
-- and a fabricated /Set/{id} endpoint that silently produced merged/wrong values).
-- Clearing just these two columns (not the rows, and not other Hawkins-sourced columns
-- like cmj_height_inches / iso_belt_squat_peak_force) so the corrected sync can rebuild
-- them cleanly from verified real 1080 Motion history.
update public.performance_metrics
set v0_speed = null, top_speed = null
where v0_speed is not null or top_speed is not null;
