export type WorkoutStatusColor = 'green' | 'yellow' | 'red'

// 0-2 completed weeks = still new. 3 = starting their 4th week (time to plan the next one).
// 4+ = finished 4 full weeks without a change (overdue).
export function getWorkoutStatusColor(weeksCompleted: number): WorkoutStatusColor {
  if (weeksCompleted >= 4) return 'red'
  if (weeksCompleted === 3) return 'yellow'
  return 'green'
}

export const WORKOUT_STATUS_STYLES: Record<WorkoutStatusColor, { dot: string; text: string; bg: string; border: string }> = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-950/20', border: 'border-emerald-800' },
  yellow: { dot: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-950/20', border: 'border-amber-800' },
  red: { dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-950/20', border: 'border-red-800' },
}
