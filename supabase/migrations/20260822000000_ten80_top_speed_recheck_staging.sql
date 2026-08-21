-- One-time retroactive cleanup: some historical 1080 sessions logged a 15-yard sprint
-- under the "10yd Off-Ice Sprint" exercise template, inflating top_speed. Correcting this
-- means re-scanning every historical session (thousands of API calls, done in resumable
-- batches — see sync-1080/index.ts recheck_top_speed mode) and only then applying the
-- result, since a single batch only sees a partial slice of any given athlete's sessions
-- and can't safely decide "no valid rep this date" on its own. This table accumulates the
-- correct best-of-genuinely-10-yard top speed per (athlete, date) across every batch before
-- anything touches performance_metrics.
create table public.ten80_recheck_staging (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null,
  best_top_speed_mph numeric,
  primary key (athlete_id, test_date)
);
