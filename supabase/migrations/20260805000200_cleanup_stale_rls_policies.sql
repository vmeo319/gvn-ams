-- These three policies pre-date this migration set and were dormant only because RLS
-- was disabled table-wide. Turning RLS on surfaced them, and they're all broken or
-- dangerous:
--   - "Allow public inserts on performance_metrics": cmd ALL, qual/with_check both `true`,
--     for role `public` — anyone, including unauthenticated requests, could insert,
--     update, or delete any athlete's metrics. All writes already go through server
--     actions using the service-role key, which bypasses RLS, so client-side write
--     access should not exist at all.
--   - "Coaches can view facility leaderboard": a raw subquery against profiles from
--     within a policy ON profiles, which trips Postgres's same-table RLS recursion
--     guard (this table's `is_coach()` policy needs `set row_security = off` to avoid
--     the same issue, hence that earlier migration).
--   - "Athletes can view own metrics": redundant with metrics_select_own_or_coach, and
--     depends on get_my_role(), which has the same recursion bug as above.
drop policy if exists "Allow public inserts on performance_metrics" on public.performance_metrics;
drop policy if exists "Athletes can view own metrics" on public.performance_metrics;
drop policy if exists "Coaches can view facility leaderboard" on public.profiles;
