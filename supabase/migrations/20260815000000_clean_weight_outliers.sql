-- For each weight_lbs reading, compares it against the median of that same athlete's
-- OTHER weight readings within +/-30 days and nulls it out if it's more than 5% off that
-- local baseline. Median (not a simple previous-vs-next comparison) is what keeps this
-- resistant to a single bad reading anchoring itself as the new "normal" — a lone mis-fire
-- reading among 3-4 good nearby readings loses the vote instead of dragging the trend line
-- with it. Only clears the weight_lbs column, never the row — a test date's other metrics
-- (iso, cmj, top speed) are untouched.
create or replace function public.clean_weight_outliers()
returns setof uuid
language sql
as $$
  with medians as (
    select
      pm.id,
      pm.weight_lbs,
      (
        select percentile_cont(0.5) within group (order by nb.weight_lbs)
        from public.performance_metrics nb
        where nb.athlete_id = pm.athlete_id
          and nb.id <> pm.id
          and nb.weight_lbs is not null
          and abs(nb.test_date - pm.test_date) <= 30
      ) as neighbor_median,
      exists (
        select 1
        from public.performance_metrics nb
        where nb.athlete_id = pm.athlete_id
          and nb.id <> pm.id
          and nb.weight_lbs is not null
          and abs(nb.test_date - pm.test_date) <= 30
      ) as has_neighbors
    from public.performance_metrics pm
    where pm.weight_lbs is not null
  ),
  flagged as (
    select id from medians
    where has_neighbors
      and neighbor_median > 0
      and abs(weight_lbs - neighbor_median) / neighbor_median > 0.05
  )
  update public.performance_metrics
  set weight_lbs = null
  where id in (select id from flagged)
  returning id;
$$;
