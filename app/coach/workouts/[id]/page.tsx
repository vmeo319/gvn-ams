'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Plus, Trash2, Copy, ChevronUp, ChevronDown, Check } from 'lucide-react'
import ExerciseCombobox from '../ExerciseCombobox'
import {
  addWeek,
  removeWeek,
  duplicateWeek,
  addDay,
  removeDay,
  renameDay,
  renameWorkout,
  publishWorkout,
  upsertExercise,
  removeExercise,
  moveExercise,
} from '../actions'

interface Day {
  id: string
  day_number: number
  name: string
}
interface Week {
  id: string
  week_number: number
  days: Day[]
}
interface Workout {
  id: string
  name: string
  status: 'draft' | 'active'
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

export default function WorkoutBuilderPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const workoutId = params.id

  const [authorized, setAuthorized] = useState(false)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exercisesLoading, setExercisesLoading] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  async function loadWorkoutAndWeeks() {
    const { data: w } = await supabase.from('workouts').select('id, name, status').eq('id', workoutId).single()
    if (!w) return
    setWorkout(w as Workout)
    setNameDraft(w.name)

    const { data: weekRows } = await supabase
      .from('workout_weeks')
      .select('id, week_number')
      .eq('workout_id', workoutId)
      .order('week_number', { ascending: true })

    const weekIds = (weekRows || []).map((wk) => wk.id)
    const { data: dayRows } = weekIds.length
      ? await supabase
          .from('workout_days')
          .select('id, week_id, day_number, name')
          .in('week_id', weekIds)
          .order('day_number', { ascending: true })
      : { data: [] as any[] }

    const nextWeeks: Week[] = (weekRows || []).map((wk) => ({
      id: wk.id,
      week_number: wk.week_number,
      days: (dayRows || []).filter((d) => d.week_id === wk.id).map((d) => ({ id: d.id, day_number: d.day_number, name: d.name })),
    }))
    setWeeks(nextWeeks)

    if (!selectedDayId && nextWeeks.length > 0 && nextWeeks[0].days.length > 0) {
      setSelectedDayId(nextWeeks[0].days[0].id)
    }
  }

  async function loadExercises(dayId: string) {
    setExercisesLoading(true)
    const { data } = await supabase
      .from('workout_exercises')
      .select('id, block_label, block_sub_index, sort_order, exercise_name, sets, reps, tempo, notes')
      .eq('day_id', dayId)
      .order('sort_order', { ascending: true })
    setExercises((data || []) as ExerciseRow[])
    setExercisesLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'coach' && profile?.role !== 'admin') {
        router.push('/athlete')
        return
      }
      setAuthorized(true)
      await loadWorkoutAndWeeks()
      setLoading(false)
    }
    init()
  }, [workoutId, router])

  useEffect(() => {
    if (selectedDayId) loadExercises(selectedDayId)
  }, [selectedDayId])

  const selectedDay = useMemo(() => {
    for (const w of weeks) {
      const d = w.days.find((d) => d.id === selectedDayId)
      if (d) return { day: d, week: w }
    }
    return null
  }, [weeks, selectedDayId])

  const blocks = useMemo(() => {
    const byLabel = new Map<string, ExerciseRow[]>()
    for (const ex of exercises) {
      if (!byLabel.has(ex.block_label)) byLabel.set(ex.block_label, [])
      byLabel.get(ex.block_label)!.push(ex)
    }
    const groups = Array.from(byLabel.entries()).map(([label, rows]) => ({
      label,
      minSort: Math.min(...rows.map((r) => r.sort_order)),
      rows: rows.sort((a, b) => a.block_sub_index - b.block_sub_index),
    }))
    return groups.sort((a, b) => a.minSort - b.minSort)
  }, [exercises])

  async function handleNameBlur() {
    if (!workout || nameDraft.trim() === workout.name) return
    const res = await renameWorkout({ workoutId: workout.id, name: nameDraft })
    if (res.success) setWorkout({ ...workout, name: nameDraft.trim() })
    else setNameDraft(workout.name)
  }

  async function handlePublish() {
    if (!workout) return
    const res = await publishWorkout({ workoutId: workout.id })
    if (res.success) setWorkout({ ...workout, status: 'active' })
  }

  async function handleAddWeek() {
    await addWeek({ workoutId })
    await loadWorkoutAndWeeks()
  }

  async function handleDuplicateWeek(weekId: string) {
    await duplicateWeek({ weekId })
    await loadWorkoutAndWeeks()
  }

  async function handleRemoveWeek(weekId: string) {
    if (!confirm('Remove this week and everything in it?')) return
    await removeWeek({ weekId })
    if (weeks.find((w) => w.id === weekId)?.days.some((d) => d.id === selectedDayId)) {
      setSelectedDayId(null)
    }
    await loadWorkoutAndWeeks()
  }

  async function handleAddDay(weekId: string) {
    await addDay({ weekId })
    await loadWorkoutAndWeeks()
  }

  async function handleRemoveDay(dayId: string) {
    if (!confirm('Remove this day?')) return
    await removeDay({ dayId })
    if (selectedDayId === dayId) setSelectedDayId(null)
    await loadWorkoutAndWeeks()
  }

  async function handleRenameDay(dayId: string, name: string) {
    await renameDay({ dayId, name })
    await loadWorkoutAndWeeks()
  }

  function nextBlockLabel(): string {
    if (blocks.length === 0) return 'A'
    const maxCode = Math.max(...blocks.map((b) => b.label.charCodeAt(0)))
    return String.fromCharCode(maxCode + 1)
  }

  async function handleAddBlock() {
    if (!selectedDayId) return
    const nextSort = exercises.length ? Math.max(...exercises.map((e) => e.sort_order)) + 1 : 1
    const res = await upsertExercise({
      dayId: selectedDayId,
      blockLabel: nextBlockLabel(),
      blockSubIndex: 1,
      sortOrder: nextSort,
      exerciseName: '',
    })
    if (res.success) await loadExercises(selectedDayId)
  }

  async function handleAddToBlock(label: string, rows: ExerciseRow[]) {
    if (!selectedDayId) return
    const nextSub = Math.max(...rows.map((r) => r.block_sub_index)) + 1
    const nextSort = exercises.length ? Math.max(...exercises.map((e) => e.sort_order)) + 1 : 1
    const res = await upsertExercise({
      dayId: selectedDayId,
      blockLabel: label,
      blockSubIndex: nextSub,
      sortOrder: nextSort,
      exerciseName: '',
    })
    if (res.success) await loadExercises(selectedDayId)
  }

  function updateLocalExercise(id: string, patch: Partial<ExerciseRow>) {
    setExercises((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  async function commitExercise(row: ExerciseRow) {
    await upsertExercise({
      id: row.id,
      dayId: selectedDayId!,
      blockLabel: row.block_label,
      blockSubIndex: row.block_sub_index,
      sortOrder: row.sort_order,
      exerciseName: row.exercise_name,
      sets: row.sets || undefined,
      reps: row.reps || undefined,
      tempo: row.tempo || undefined,
      notes: row.notes || undefined,
    })
  }

  async function handleRemoveExerciseRow(id: string) {
    await removeExercise({ id })
    if (selectedDayId) await loadExercises(selectedDayId)
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    if (!selectedDayId) return
    await moveExercise({ dayId: selectedDayId, id, direction })
    await loadExercises(selectedDayId)
  }

  if (loading || !authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleNameBlur}
            className="text-2xl font-bold tracking-tight bg-transparent border-b border-transparent focus:border-red-600 focus:outline-none text-white max-w-xl"
          />
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
              workout?.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {workout?.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {workout?.status === 'draft' && (
            <button
              onClick={handlePublish}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm"
            >
              <Check className="w-4 h-4" />
              <span>Publish</span>
            </button>
          )}
          <Link
            href="/coach/workouts"
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Workouts</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Left: week/day tree */}
        <div className="md:col-span-1 rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-3 max-h-[75vh] overflow-y-auto">
          {weeks.map((week) => (
            <div key={week.id} className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-slate-300">Week {week.week_number}</span>
                <div className="flex items-center gap-1">
                  <button
                    title="Duplicate week"
                    onClick={() => handleDuplicateWeek(week.id)}
                    className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title="Remove week"
                    onClick={() => handleRemoveWeek(week.id)}
                    className="p-1 rounded hover:bg-red-950/40 text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {week.days.map((day) => (
                <DayRow
                  key={day.id}
                  day={day}
                  selected={selectedDayId === day.id}
                  onSelect={() => setSelectedDayId(day.id)}
                  onRename={(name) => handleRenameDay(day.id, name)}
                  onRemove={() => handleRemoveDay(day.id)}
                />
              ))}
              <button
                onClick={() => handleAddDay(week.id)}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition"
              >
                + Day
              </button>
            </div>
          ))}
          <button
            onClick={handleAddWeek}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-700 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition"
          >
            <Plus className="w-4 h-4" />
            Week
          </button>
        </div>

        {/* Right: block/exercise editor */}
        <div className="md:col-span-3 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 min-h-[60vh]">
          {!selectedDay && <div className="text-slate-500 text-sm">Select a day to edit.</div>}
          {selectedDay && (
            <>
              <div className="text-sm text-slate-500">
                Week {selectedDay.week.week_number} <span className="mx-1">›</span> {selectedDay.day.name}
              </div>

              <button
                onClick={handleAddBlock}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-sm font-semibold px-3 py-2 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Block
              </button>

              {exercisesLoading && <div className="text-slate-500 text-sm">Loading...</div>}

              {!exercisesLoading &&
                blocks.map((block) => (
                  <div key={block.label} className="rounded-lg border border-slate-800 overflow-hidden">
                    {block.rows.map((row) => (
                      <div key={row.id} className="grid grid-cols-12 gap-2 items-start p-3 border-b border-slate-800 last:border-b-0 bg-slate-950/40">
                        <div className="col-span-1 flex flex-col items-center gap-1 pt-1.5">
                          <span className="w-7 h-7 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                            {block.label}
                            {block.rows.length > 1 ? row.block_sub_index : ''}
                          </span>
                          <div className="flex gap-0.5">
                            <button onClick={() => handleMove(row.id, 'up')} className="text-slate-600 hover:text-slate-300">
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleMove(row.id, 'down')} className="text-slate-600 hover:text-slate-300">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="col-span-3">
                          <ExerciseCombobox
                            value={row.exercise_name}
                            onCommit={(name) => {
                              updateLocalExercise(row.id, { exercise_name: name })
                              commitExercise({ ...row, exercise_name: name })
                            }}
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            value={row.sets || ''}
                            onChange={(e) => updateLocalExercise(row.id, { sets: e.target.value })}
                            onBlur={() => commitExercise(row)}
                            placeholder="Sets"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            value={row.reps || ''}
                            onChange={(e) => updateLocalExercise(row.id, { reps: e.target.value })}
                            onBlur={() => commitExercise(row)}
                            placeholder="Reps"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            value={row.tempo || ''}
                            onChange={(e) => updateLocalExercise(row.id, { tempo: e.target.value })}
                            onBlur={() => commitExercise(row)}
                            placeholder="Tempo"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                          />
                        </div>
                        <div className="col-span-3">
                          <textarea
                            value={row.notes || ''}
                            onChange={(e) => updateLocalExercise(row.id, { notes: e.target.value })}
                            onBlur={() => commitExercise(row)}
                            placeholder="Notes"
                            rows={1}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-red-600 resize-y"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end pt-1.5">
                          <button onClick={() => handleRemoveExerciseRow(row.id)} className="text-slate-600 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => handleAddToBlock(block.label, block.rows)}
                      className="w-full text-left px-4 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition"
                    >
                      + Superset in {block.label}
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function DayRow({
  day,
  selected,
  onSelect,
  onRename,
  onRemove,
}: {
  day: Day
  selected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(day.name)

  useEffect(() => setDraft(day.name), [day.name])

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft.trim() && draft.trim() !== day.name) onRename(draft.trim())
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-full bg-slate-950 border border-red-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none"
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group transition ${
        selected ? 'bg-red-950/30 text-white' : 'text-slate-400 hover:bg-slate-800/60'
      }`}
      onClick={onSelect}
    >
      <span className="text-sm truncate" onDoubleClick={() => setEditing(true)}>
        {day.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
