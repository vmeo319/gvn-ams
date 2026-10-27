export interface Metric {
  test_date: string
  iso_belt_squat_peak_force: number | null
  top_speed: number | null
  cmj_height_inches: number | null
  weight_lbs: number | null
}

export type MetricKey = 'iso' | 'cmj' | 'top_speed' | 'weight'

export const METRIC_INFO: Record<
  MetricKey,
  { field: keyof Metric; name: string; unit: string; color: string; decimals: number; summaryMode: 'max' | 'latest' }
> = {
  iso: { field: 'iso_belt_squat_peak_force', name: 'ISO Force (N/kg)', unit: 'N/kg', color: '#ef4444', decimals: 1, summaryMode: 'max' },
  cmj: { field: 'cmj_height_inches', name: 'Jump Height (in)', unit: 'in', color: '#3b82f6', decimals: 2, summaryMode: 'max' },
  top_speed: { field: 'top_speed', name: 'Top Speed (mph)', unit: 'mph', color: '#10b981', decimals: 2, summaryMode: 'max' },
  // A "best-ever" reading doesn't mean anything for bodyweight — the current value is what
  // matters, so its summary card shows the most recent entry instead of the max.
  weight: { field: 'weight_lbs', name: 'Weight (lbs)', unit: 'lbs', color: '#a855f7', decimals: 1, summaryMode: 'latest' },
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
