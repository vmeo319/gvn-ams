-- Previewed against real data before picking a number: at 5% roughly half of what got
-- flagged was ordinary day-to-day weight fluctuation (a few lbs reads as 5%+ for a lighter
-- athlete), not bad data. 10% still catches everything genuinely implausible (a cluster of
-- different athletes all reading 300-400+ lbs on the same date — a force-plate calibration
-- issue, not real weight) while leaving normal noise alone.
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
      and abs(weight_lbs - neighbor_median) / neighbor_median > 0.10
  )
  update public.performance_metrics
  set weight_lbs = null
  where id in (select id from flagged)
  returning id;
$$;
