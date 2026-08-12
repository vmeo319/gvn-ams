'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const formatError = (err: any) => {
  if (!err) return 'Unknown error.'
  if (typeof err === 'string') return err
  if (err.message && err.message !== '{}') return err.message
  try {
    const str = JSON.stringify(err)
    if (str !== '{}') return str
  } catch (e) {}
  return 'Something went wrong.'
}

export async function logExerciseSet(data: {
  workoutExerciseId: string
  athleteId: string
  reps: number
  weightLbs: number
  notes?: string
  loggedBy?: string
}) {
  const { error } = await supabaseAdmin.from('exercise_logs').insert({
    workout_exercise_id: data.workoutExerciseId,
    athlete_id: data.athleteId,
    reps: data.reps,
    weight_lbs: data.weightLbs,
    notes: data.notes || null,
    logged_by: data.loggedBy || null,
  })
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}
