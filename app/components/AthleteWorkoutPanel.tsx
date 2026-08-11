'use client'

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getWorkoutStatusColor, WORKOUT_STATUS_STYLES } from '@/lib/workoutStatus'
import { searchActiveWorkouts, assignWorkoutToAthlete, clearWorkoutAssignment } from '@/app/coach/workouts/actions'

interface CurrentWorkout {
  workout_id: string
  workout_name: string
  weeks_completed: number | null
}

interface HistoryRow {
  id: string
  workout_id: string
  workout_name: string
  started_on: string
  ended_on: string | null
  weeks_completed: number
}

export default function AthleteWorkoutPanel({ athleteId, coachId }: { athleteId: string; coachId: string }) {
  const [current, setCurrent] = useState<CurrentWorkout | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  const [assignOpen, setAssignOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [assigning, setAssigning] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  async function loadAll() {
    setLoading(true)
    const { data: cur } = await supabase
      .from('athlete_current_workout')
      .select('workout_id, workout_name, weeks_completed')
      .eq('athlete_id', athleteId)
      .maybeSingle()
    setCurrent(cur as CurrentWorkout | null)

    const { data: histRows } = await supabase
      .from('athlete_workout_history')
      .select('id, workout_id, started_on, ended_on, weeks_completed')
      .eq('athlete_id', athleteId)
      .order('started_on', { ascending: false })

    if (histRows && histRows.length > 0) {
      const workoutIds = Array.from(new Set(histRows.map((h) => h.workout_id)))
      const { data: workouts } = await supabase.from('workouts').select('id, name').in('id', workoutIds)
      const nameById = new Map((workouts || []).map((w) => [w.id, w.name]))
      setHistory(histRows.map((h) => ({ ...h, workout_name: nameById.get(h.workout_id) || 'Unknown' })))
    } else {
      setHistory([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [athleteId])

  useEffect(() => {
    if (!assignOpen) return
    const handle = setTimeout(async () => {
      const res = await searchActiveWorkouts(query)
      if (res.success) setResults(res.results)
    }, 200)
    return () => clearTimeout(handle)
  }, [query, assignOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAssignOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleAssign(workoutId: string) {
    setAssigning(true)
    await assignWorkoutToAthlete({ athleteId, workoutId, coachId })
    setAssigning(false)
    setAssignOpen(false)
    setQuery('')
    await loadAll()
  }

  async function handleClear() {
    if (!confirm('Remove this athlete\'s current workout? This deletes their in-progress week count for it (any earlier completed workouts stay in their history).')) return
    setAssigning(true)
    await clearWorkoutAssignment({ athleteId })
    setAssigning(false)
    await loadAll()
  }

  const color = current ? getWorkoutStatusColor(current.weeks_completed || 0) : null
  const style = color ? WORKOUT_STATUS_STYLES[color] : null

  return (
    <div className="p-6 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <h2 className="text-lg font-semibold">Current Workout</h2>

      {loading && <div className="text-sm text-slate-500">Loading...</div>}

      {!loading && (
        <div className="flex items-center justify-between gap-3">
          {current ? (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${style!.border} ${style!.bg}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${style!.dot}`} />
              <span className="font-semibold text-white">{current.workout_name}</span>
              <span className={`text-xs ${style!.text}`}>Week {(current.weeks_completed || 0) + 1}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-500">No workout assigned.</span>
          )}

          <div className="flex items-center gap-2">
          {current && (
            <button
              onClick={handleClear}
              disabled={assigning}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 text-sm font-semibold transition disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <div ref={boxRef} className="relative">
            <button
              onClick={() => setAssignOpen((v) => !v)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
            >
              {current ? 'Change Workout' : 'Assign Workout'}
            </button>
            {assignOpen && (
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search active workouts..."
                  className="w-full bg-slate-950 border-b border-slate-800 rounded-t-lg px-3 py-2 text-sm text-white focus:outline-none"
                />
                <div className="max-h-56 overflow-y-auto">
                  {results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No matches.</div>}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      disabled={assigning}
                      onClick={() => handleAssign(r.id)}
                      className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="pt-2 border-t border-slate-800 space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 uppercase">Workout History</div>
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-sm py-1">
              <span className="text-slate-300">{h.workout_name}</span>
              <span className="text-slate-500 text-xs">
                {h.ended_on ? `${h.weeks_completed} weeks` : `In progress · week ${h.weeks_completed + 1}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
