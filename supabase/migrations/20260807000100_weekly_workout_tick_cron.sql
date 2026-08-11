-- Every currently-open athlete_workout_history row (ended_on is null) IS that athlete's
-- active workout by definition — reassignment already closes the old row and opens a new
-- one immediately (see assignWorkoutToAthlete), so incrementing every open row once a week
-- is the entire job. No edge function needed since this touches no external API.
select cron.schedule(
  'weekly-workout-tick',
  '0 5 * * 1', -- Monday 05:00 UTC ~= Sunday night US Central
  $$ update public.athlete_workout_history set weeks_completed = weeks_completed + 1 where ended_on is null; $$
);
