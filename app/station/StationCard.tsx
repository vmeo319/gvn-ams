'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { X } from 'lucide-react'

interface Week {
  id: string
  week_number: number
}
interface Day {
  id: string
  week_id: string
  day_number: number
  name: string
}
interface ExerciseRow {
  id: string
  block_label: string
  block_sub_index: number
  sort_order: number
  exercise_name: string
  sets: string | null
  reps: string | null
  tempo: string | null
  notes: string | null
}

export default function StationCard({ athleteId, onRemove }: { athleteId: string; onRemove: () => void }) {
  const [athleteName, setAthleteName] = useState('')
  const [workoutId, setWorkoutId] = useState<string | null>(null)
  const [workoutName, setWorkoutName] = useState('')
  const [weeks, setWeeks] = useState<Week[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', athleteId)
        .single()
      setAthleteName(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim())

      const { data: current } = await supabase
        .from('athlete_current_workout')
        .select('workout_id, workout_name, weeks_completed')
        .eq('athlete_id', athleteId)
        .maybeSingle()

      if (!current) {
        setLoading(false)
        return
      }
      setWorkoutId(current.workout_id)
      setWorkoutName(current.workout_name)

      const { data: weekRows } = await supabase
        .from('workout_weeks')
        .select('id, week_number')
        .eq('workout_id', current.workout_id)
        .order('week_number', { ascending: true })
      setWeeks((weekRows || []) as Week[])

      const weekIds = (weekRows || []).map((w) => w.id)
      const { data: dayRows } = weekIds.length
        ? await supabase
            .from('workout_days')
            .select('id, week_id, day_number, name')
            .in('week_id', weekIds)
            .order('day_number', { ascending: true })
        : { data: [] as any[] }
      setDays((dayRows || []) as Day[])

      // Default to the athlete's actual current week (clamped to however many weeks this
      // program has), Day 1 — viewing here never changes their real assignment/tracking.
      const targetWeekNumber = Math.min((current.weeks_completed || 0) + 1, (weekRows || []).length || 1)
      const targetWeek = (weekRows || []).find((w) => w.week_number === targetWeekNumber) || weekRows?.[0]
      if (targetWeek) {
        setSelectedWeekId(targetWeek.id)
        const firstDay = (dayRows || []).find((d) => d.week_id === targetWeek.id)
        if (firstDay) setSelectedDayId(firstDay.id)
      }
      setLoading(false)
    }
    load()
  }, [athleteId])

  useEffect(() => {
    async function loadExercises() {
      if (!selectedDayId) {
        setExercises([])
        return
      }
      const { data } = await supabase
        .from('workout_exercises')
        .select('id, block_label, block_sub_index, sort_order, exercise_name, sets, reps, tempo, notes')
        .eq('day_id', selectedDayId)
        .order('sort_order', { ascending: true })
      setExercises((data || []) as ExerciseRow[])
    }
    loadExercises()
  }, [selectedDayId])

  const daysForSelectedWeek = useMemo(
    () => days.filter((d) => d.week_id === selectedWeekId).sort((a, b) => a.day_number - b.day_number),
    [days, selectedWeekId]
  )

  const blocks = useMemo(() => {
    const byLabel = new Map<string, ExerciseRow[]>()
    for (const ex of exercises) {
      if (!byLabel.has(ex.block_label)) byLabel.set(ex.block_label, [])
      byLabel.get(ex.block_label)!.push(ex)
    }
    return Array.from(byLabel.entries())
      .map(([label, rows]) => ({
        label,
        minSort: Math.min(...rows.map((r) => r.sort_order)),
        rows: rows.sort((a, b) => a.block_sub_index - b.block_sub_index),
      }))
      .sort((a, b) => a.minSort - b.minSort)
  }, [exercises])

  function handleWeekChange(weekId: string) {
    setSelectedWeekId(weekId)
    const firstDay = days.find((d) => d.week_id === weekId)
    setSelectedDayId(firstDay ? firstDay.id : null)
  }

  const currentWeekNumber = weeks.find((w) => w.id === selectedWeekId)?.week_number

  return (
    <div className="w-80 shrink-0 rounded-xl border border-slate-800 bg-slate-900 flex flex-col max-h-[85vh]">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <span className="font-bold text-white truncate">{athleteName || '...'}</span>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading && <div className="p-4 text-sm text-slate-500">Loading...</div>}

      {!loading && !workoutId && <div className="p-4 text-sm text-slate-500">No workout assigned.</div>}

      {!loading && workoutId && (
        <>
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="text-xs text-slate-500 truncate">{workoutName}</div>
            <div className="flex gap-2">
              <select
                value={selectedWeekId || ''}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none"
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    Week {w.week_number}
                  </option>
                ))}
              </select>
              <select
                value={selectedDayId || ''}
                onChange={(e) => setSelectedDayId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none"
              >
                {daysForSelectedWeek.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {currentWeekNumber && <div className="text-[11px] text-slate-500">Currently viewing Week {currentWeekNumber}</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {blocks.length === 0 && <div className="text-sm text-slate-600">No exercises for this day.</div>}
            {blocks.map((block) => (
              <div key={block.label} className="rounded-lg border border-slate-800 overflow-hidden">
                {block.rows.map((row) => (
                  <div key={row.id} className="px-3 py-2 border-b border-slate-800 last:border-b-0 bg-slate-950/40">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                        {block.label}
                        {block.rows.length > 1 ? row.block_sub_index : ''}
                      </span>
                      <span className="font-semibold text-slate-100 text-sm">{row.exercise_name}</span>
                    </div>
                    <div className="mt-1 pl-8 text-xs text-slate-400 flex gap-3">
                      {row.sets && <span>Sets: {row.sets}</span>}
                      {row.reps && <span>Reps: {row.reps}</span>}
                      {row.tempo && <span>Tempo: {row.tempo}</span>}
                    </div>
                    {row.notes && <div className="mt-1 pl-8 text-xs text-slate-500 italic">{row.notes}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
