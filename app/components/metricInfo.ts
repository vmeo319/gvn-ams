export interface Metric {
  test_date: string
  iso_belt_squat_peak_force: number | null
  top_speed: number | null
  cmj_height_inches: number | null
  weight_lbs: number | null
  on_ice_top_speed: number | null
  on_ice_accel_max: number | null
  on_ice_15yd_time: number | null
}

// Every performance_metrics column the metric dashboards read, for .select().
export const METRIC_COLUMNS =
  'test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches, weight_lbs, on_ice_top_speed, on_ice_accel_max, on_ice_15yd_time'

export type MetricKey = 'iso' | 'cmj' | 'top_speed' | 'weight' | 'on_ice_speed' | 'on_ice_accel' | 'on_ice_15yd'

// summaryMode: the headline number on an athlete's chart card ('min' for times, where lower
// is better). optional: only tested for some athletes, so the card is hidden when an athlete
// has no readings instead of showing an empty chart.
export const METRIC_INFO: Record<
  MetricKey,
  {
    field: keyof Metric
    name: string
    unit: string
    color: string
    decimals: number
    summaryMode: 'max' | 'min' | 'latest'
    optional?: boolean
  }
> = {
  iso: { field: 'iso_belt_squat_peak_force', name: 'ISO Force (N/kg)', unit: 'N/kg', color: '#ef4444', decimals: 1, summaryMode: 'max' },
  cmj: { field: 'cmj_height_inches', name: 'Jump Height (in)', unit: 'in', color: '#3b82f6', decimals: 2, summaryMode: 'max' },
  top_speed: { field: 'top_speed', name: 'Top Speed (mph)', unit: 'mph', color: '#10b981', decimals: 2, summaryMode: 'max' },
  // A "best-ever" reading doesn't mean anything for bodyweight — the current value is what
  // matters, so its summary card shows the most recent entry instead of the max.
  weight: { field: 'weight_lbs', name: 'Weight (lbs)', unit: 'lbs', color: '#a855f7', decimals: 1, summaryMode: 'latest' },
  // 1080 "On-Ice Sprint Profile" (2 kg resisted skating sprints).
  on_ice_speed: { field: 'on_ice_top_speed', name: 'On-Ice Top Speed (mph)', unit: 'mph', color: '#06b6d4', decimals: 2, summaryMode: 'max', optional: true },
  on_ice_accel: { field: 'on_ice_accel_max', name: 'On-Ice Max Acceleration (m/s²)', unit: 'm/s²', color: '#f59e0b', decimals: 2, summaryMode: 'max', optional: true },
  on_ice_15yd: { field: 'on_ice_15yd_time', name: 'On-Ice 15yd Time (s)', unit: 's', color: '#ec4899', decimals: 2, summaryMode: 'min', optional: true },
}

export function hasMetricData(metrics: Metric[], key: MetricKey): boolean {
  const field = METRIC_INFO[key].field
  return metrics.some((m) => m[field] !== null && m[field] !== undefined)
}

// Metrics worth showing for an athlete: every core metric, plus optional ones they have data for.
export function visibleMetricKeys(metrics: Metric[]): MetricKey[] {
  return (Object.keys(METRIC_INFO) as MetricKey[]).filter((k) => !METRIC_INFO[k].optional || hasMetricData(metrics, k))
}

// CMJ force-plate detail (performance_metrics columns, all from the day's best-height jump).
// `better` says which way is improvement; impulse ratio is a jump strategy, not better/worse.
export const CMJ_DETAIL_FIELDS = [
  'cmj_peak_rel_prop_power',
  'cmj_avg_rel_braking_force',
  'cmj_avg_rel_prop_force',
  'cmj_braking_phase_s',
  'cmj_propulsive_phase_s',
  'cmj_impulse_ratio',
] as const
export type CmjDetailField = (typeof CMJ_DETAIL_FIELDS)[number]

export const CMJ_DETAIL_INFO: Record<
  CmjDetailField,
  { name: string; unit: string; color: string; decimals: number; better: 'higher' | 'lower' | 'neutral' }
> = {
  cmj_peak_rel_prop_power: { name: 'Peak Rel. Propulsive Power (W/kg)', unit: 'W/kg', color: '#3b82f6', decimals: 1, better: 'higher' },
  cmj_avg_rel_braking_force: { name: 'Avg Rel. Braking Force (% BW)', unit: '%', color: '#3b82f6', decimals: 1, better: 'higher' },
  cmj_avg_rel_prop_force: { name: 'Avg Rel. Propulsive Force (% BW)', unit: '%', color: '#3b82f6', decimals: 1, better: 'higher' },
  cmj_braking_phase_s: { name: 'Braking Phase (s)', unit: 's', color: '#3b82f6', decimals: 3, better: 'lower' },
  cmj_propulsive_phase_s: { name: 'Propulsive Phase (s)', unit: 's', color: '#3b82f6', decimals: 3, better: 'lower' },
  cmj_impulse_ratio: { name: 'Impulse Ratio', unit: '', color: '#3b82f6', decimals: 2, better: 'neutral' },
}

// Impulse ratio = propulsive net impulse / braking net impulse. Lower means more of the jump
// comes from the braking (eccentric) phase; higher means the athlete relies on pushing.
// Cutoffs per GVN's staff -- confirm the direction with them before acting on the labels.
export const IMPULSE_RATIO_CUTOFFS = { braking: 1.8, propulsive: 2.2 }
export type JumpStrategy = 'braking' | 'balanced' | 'propulsive'
export function jumpStrategy(impulseRatio: number): JumpStrategy {
  if (impulseRatio < IMPULSE_RATIO_CUTOFFS.braking) return 'braking'
  if (impulseRatio > IMPULSE_RATIO_CUTOFFS.propulsive) return 'propulsive'
  return 'balanced'
}

export function formatTickDate(dateStr: unknown): string {
  const str = String(dateStr ?? '')
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
