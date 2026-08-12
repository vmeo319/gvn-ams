export interface VolumeLog {
  logged_at: string
  reps: number
  weight_lbs: number
}

export interface WeeklyVolumeBucket {
  weekStart: string // YYYY-MM-DD, Monday
  totalVolume: number
}

// Rolls back to the most recent Monday — same Mon-Sun convention used for workout-duration
// tracking (the weekly-workout-tick cron), so "this week" means the same thing everywhere.
export function getWeekStart(date: Date): string {
  const d = new Date(date)
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  return d.toISOString().split('T')[0]
}

// Total volume load (tonnage) = Σ(reps × weight) per week — the standard strength-training
// measure of total weight moved, used here to track load/fatigue trends over time.
export function bucketLogsByWeek(logs: VolumeLog[]): WeeklyVolumeBucket[] {
  const totals = new Map<string, number>()
  for (const log of logs) {
    const weekStart = getWeekStart(new Date(log.logged_at))
    totals.set(weekStart, (totals.get(weekStart) || 0) + log.reps * log.weight_lbs)
  }
  return Array.from(totals.entries())
    .map(([weekStart, totalVolume]) => ({ weekStart, totalVolume }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}
