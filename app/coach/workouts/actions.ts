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

const DEFAULT_WEEK_COUNT = 4
const DEFAULT_DAY_COUNT = 5

async function createDefaultDays(weekId: string) {
  const days = Array.from({ length: DEFAULT_DAY_COUNT }, (_, i) => ({
    week_id: weekId,
    day_number: i + 1,
    name: `Day ${i + 1}`,
  }))
  const { error } = await supabaseAdmin.from('workout_days').insert(days)
  if (error) throw error
}

export async function createWorkout(data: { name?: string; createdBy: string }) {
  try {
    const name = data.name?.trim() || `Untitled Workout — ${new Date().toLocaleString('en-US')}`

    const { data: workout, error: workoutErr } = await supabaseAdmin
      .from('workouts')
      .insert({ name, status: 'draft', created_by: data.createdBy })
      .select('id')
      .single()
    if (workoutErr || !workout) return { success: false, error: formatError(workoutErr) }

    for (let weekNumber = 1; weekNumber <= DEFAULT_WEEK_COUNT; weekNumber++) {
      const { data: week, error: weekErr } = await supabaseAdmin
        .from('workout_weeks')
        .insert({ workout_id: workout.id, week_number: weekNumber })
        .select('id')
        .single()
      if (weekErr || !week) return { success: false, error: formatError(weekErr) }
      await createDefaultDays(week.id)
    }

    return { success: true, workoutId: workout.id }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function renameWorkout(data: { workoutId: string; name: string }) {
  const name = data.name.trim()
  if (!name) return { success: false, error: 'Name cannot be blank.' }
  const { error } = await supabaseAdmin
    .from('workouts')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', data.workoutId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function publishWorkout(data: { workoutId: string }) {
  const { error } = await supabaseAdmin
    .from('workouts')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', data.workoutId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function deleteWorkout(data: { workoutId: string }) {
  const { data: workout } = await supabaseAdmin.from('workouts').select('status').eq('id', data.workoutId).single()
  if (workout?.status !== 'draft') {
    return { success: false, error: 'Only draft workouts can be deleted.' }
  }
  const { error } = await supabaseAdmin.from('workouts').delete().eq('id', data.workoutId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function addWeek(data: { workoutId: string }) {
  const { data: existing } = await supabaseAdmin
    .from('workout_weeks')
    .select('week_number')
    .eq('workout_id', data.workoutId)
    .order('week_number', { ascending: false })
    .limit(1)
  const nextWeekNumber = (existing?.[0]?.week_number || 0) + 1

  const { data: week, error } = await supabaseAdmin
    .from('workout_weeks')
    .insert({ workout_id: data.workoutId, week_number: nextWeekNumber })
    .select('id')
    .single()
  if (error || !week) return { success: false, error: formatError(error) }
  await createDefaultDays(week.id)
  return { success: true, weekId: week.id }
}

export async function removeWeek(data: { weekId: string }) {
  const { error } = await supabaseAdmin.from('workout_weeks').delete().eq('id', data.weekId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

// Deep-copies a week's days/exercises into a new week appended to the same workout.
export async function duplicateWeek(data: { weekId: string }) {
  try {
    const { data: sourceWeek, error: sourceErr } = await supabaseAdmin
      .from('workout_weeks')
      .select('id, workout_id')
      .eq('id', data.weekId)
      .single()
    if (sourceErr || !sourceWeek) return { success: false, error: formatError(sourceErr) }

    const { data: existing } = await supabaseAdmin
      .from('workout_weeks')
      .select('week_number')
      .eq('workout_id', sourceWeek.workout_id)
      .order('week_number', { ascending: false })
      .limit(1)
    const nextWeekNumber = (existing?.[0]?.week_number || 0) + 1

    const { data: newWeek, error: newWeekErr } = await supabaseAdmin
      .from('workout_weeks')
      .insert({ workout_id: sourceWeek.workout_id, week_number: nextWeekNumber })
      .select('id')
      .single()
    if (newWeekErr || !newWeek) return { success: false, error: formatError(newWeekErr) }

    const { data: sourceDays } = await supabaseAdmin
      .from('workout_days')
      .select('id, day_number, name')
      .eq('week_id', sourceWeek.id)
      .order('day_number', { ascending: true })

    for (const day of sourceDays || []) {
      const { data: newDay, error: newDayErr } = await supabaseAdmin
        .from('workout_days')
        .insert({ week_id: newWeek.id, day_number: day.day_number, name: day.name })
        .select('id')
        .single()
      if (newDayErr || !newDay) return { success: false, error: formatError(newDayErr) }

      const { data: sourceExercises } = await supabaseAdmin
        .from('workout_exercises')
        .select('block_label, block_sub_index, sort_order, exercise_name, sets, reps, tempo, notes')
        .eq('day_id', day.id)
        .order('sort_order', { ascending: true })

      if (sourceExercises && sourceExercises.length > 0) {
        const copies = sourceExercises.map((ex) => ({ ...ex, day_id: newDay.id }))
        const { error: copyErr } = await supabaseAdmin.from('workout_exercises').insert(copies)
        if (copyErr) return { success: false, error: formatError(copyErr) }
      }
    }

    return { success: true, weekId: newWeek.id }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function addDay(data: { weekId: string }) {
  const { data: existing } = await supabaseAdmin
    .from('workout_days')
    .select('day_number')
    .eq('week_id', data.weekId)
    .order('day_number', { ascending: false })
    .limit(1)
  const nextDayNumber = (existing?.[0]?.day_number || 0) + 1

  const { data: day, error } = await supabaseAdmin
    .from('workout_days')
    .insert({ week_id: data.weekId, day_number: nextDayNumber, name: `Day ${nextDayNumber}` })
    .select('id')
    .single()
  if (error || !day) return { success: false, error: formatError(error) }
  return { success: true, dayId: day.id }
}

export async function removeDay(data: { dayId: string }) {
  const { error } = await supabaseAdmin.from('workout_days').delete().eq('id', data.dayId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function renameDay(data: { dayId: string; name: string }) {
  const name = data.name.trim()
  if (!name) return { success: false, error: 'Name cannot be blank.' }
  const { error } = await supabaseAdmin.from('workout_days').update({ name }).eq('id', data.dayId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function upsertExercise(data: {
  id?: string
  dayId: string
  blockLabel: string
  blockSubIndex: number
  sortOrder: number
  exerciseName: string
  sets?: string
  reps?: string
  tempo?: string
  notes?: string
}) {
  const payload = {
    day_id: data.dayId,
    block_label: data.blockLabel,
    block_sub_index: data.blockSubIndex,
    sort_order: data.sortOrder,
    exercise_name: data.exerciseName,
    sets: data.sets || null,
    reps: data.reps || null,
    tempo: data.tempo || null,
    notes: data.notes || null,
  }

  if (data.id) {
    const { error } = await supabaseAdmin.from('workout_exercises').update(payload).eq('id', data.id)
    if (error) return { success: false, error: formatError(error) }
    return { success: true, id: data.id }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('workout_exercises')
    .insert(payload)
    .select('id')
    .single()
  if (error || !inserted) return { success: false, error: formatError(error) }
  return { success: true, id: inserted.id }
}

export async function removeExercise(data: { id: string }) {
  const { error } = await supabaseAdmin.from('workout_exercises').delete().eq('id', data.id)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function moveExercise(data: { dayId: string; id: string; direction: 'up' | 'down' }) {
  const { data: rows } = await supabaseAdmin
    .from('workout_exercises')
    .select('id, sort_order')
    .eq('day_id', data.dayId)
    .order('sort_order', { ascending: true })

  if (!rows) return { success: false, error: 'Could not load exercises.' }
  const idx = rows.findIndex((r) => r.id === data.id)
  if (idx === -1) return { success: false, error: 'Exercise not found.' }
  const swapIdx = data.direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return { success: true }

  const a = rows[idx]
  const b = rows[swapIdx]
  await supabaseAdmin.from('workout_exercises').update({ sort_order: b.sort_order }).eq('id', a.id)
  await supabaseAdmin.from('workout_exercises').update({ sort_order: a.sort_order }).eq('id', b.id)
  return { success: true }
}

export async function searchExerciseLibrary(query: string) {
  const { data, error } = await supabaseAdmin
    .from('exercise_library')
    .select('id, name')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(20)
  if (error) return { success: false, error: formatError(error), results: [] }
  return { success: true, results: data || [] }
}

export async function createLibraryExercise(data: { name: string }) {
  const name = data.name.trim()
  if (!name) return { success: false, error: 'Name cannot be blank.' }
  const { data: inserted, error } = await supabaseAdmin
    .from('exercise_library')
    .upsert({ name }, { onConflict: 'name', ignoreDuplicates: false })
    .select('id, name')
    .single()
  if (error || !inserted) return { success: false, error: formatError(error) }
  return { success: true, exercise: inserted }
}

export async function searchActiveWorkouts(query: string) {
  const { data, error } = await supabaseAdmin
    .from('workouts')
    .select('id, name')
    .eq('status', 'active')
    .ilike('name', `%${query}%`)
    .order('name', { ascending: true })
    .limit(20)
  if (error) return { success: false, error: formatError(error), results: [] }
  return { success: true, results: data || [] }
}

// Reassigns an athlete's current workout, closing out the previous open history row (if any)
// and opening a fresh one for the new workout — this is the entire duration-tracking model;
// the weekly cron just increments whatever's open.
export async function assignWorkoutToAthlete(data: { athleteId: string; workoutId: string; coachId: string }) {
  try {
    const { data: openHistory } = await supabaseAdmin
      .from('athlete_workout_history')
      .select('id, workout_id')
      .eq('athlete_id', data.athleteId)
      .is('ended_on', null)
      .maybeSingle()

    if (openHistory && openHistory.workout_id === data.workoutId) {
      return { success: true, message: 'Athlete is already on this workout.' }
    }

    const { error: assignErr } = await supabaseAdmin.from('athlete_workout_assignments').upsert(
      {
        athlete_id: data.athleteId,
        workout_id: data.workoutId,
        assigned_at: new Date().toISOString().split('T')[0],
        assigned_by: data.coachId,
      },
      { onConflict: 'athlete_id' }
    )
    if (assignErr) return { success: false, error: formatError(assignErr) }

    if (openHistory) {
      const { error: closeErr } = await supabaseAdmin
        .from('athlete_workout_history')
        .update({ ended_on: new Date().toISOString().split('T')[0] })
        .eq('id', openHistory.id)
      if (closeErr) return { success: false, error: formatError(closeErr) }
    }

    const { error: openErr } = await supabaseAdmin.from('athlete_workout_history').insert({
      athlete_id: data.athleteId,
      workout_id: data.workoutId,
      started_on: new Date().toISOString().split('T')[0],
      weeks_completed: 0,
    })
    if (openErr) return { success: false, error: formatError(openErr) }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
