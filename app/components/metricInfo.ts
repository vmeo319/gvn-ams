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

export function formatTickDate(dateStr: unknown): string {
  const str = String(dateStr ?? '')
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
