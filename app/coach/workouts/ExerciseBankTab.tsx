'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Dumbbell } from 'lucide-react'
import { listExerciseLibrary, getExerciseUsage } from './actions'

interface ExerciseRow {
  id: string
  name: string
}

interface UsageRow {
  workout_id: string
  workout_name: string
  workout_status: string
}

function ExerciseUsageRow({ exercise }: { exercise: ExerciseRow }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [usage, setUsage] = useState<UsageRow[] | null>(null)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && usage === null) {
      setLoading(true)
      const res = await getExerciseUsage(exercise.name)
      setUsage(res.success ? (res.results as UsageRow[]) : [])
      setLoading(false)
    }
  }

  return (
    <div className="border-b border-slate-800/60 last:border-b-0">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition"
      >
        <span className="text-sm font-medium text-slate-200">{exercise.name}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 pl-4">
          {loading ? (
            <div className="text-xs text-slate-500">Loading...</div>
          ) : !usage || usage.length === 0 ? (
            <div className="text-xs text-slate-500">Not used in any program yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {usage.map((u) => (
                <Link
                  key={u.workout_id}
                  href={`/coach/workouts/${u.workout_id}`}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 transition"
                >
                  <span>{u.workout_name}</span>
                  {u.workout_status === 'draft' && (
                    <span className="text-[10px] text-slate-500">(draft)</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExerciseBankTab({ locationId }: { locationId: string | null }) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      if (!locationId) return
      setLoading(true)
      const res = await listExerciseLibrary(locationId)
      setExercises(res.success ? (res.results as ExerciseRow[]) : [])
      setLoading(false)
    }
    load()
  }, [locationId])

  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search exercise bank..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading exercise bank...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
            <Dumbbell className="w-6 h-6 text-slate-700" />
            <span>{exercises.length === 0 ? 'No exercises logged for this location yet.' : 'No matches.'}</span>
            <span className="text-xs text-slate-600">Exercises are added automatically as coaches build programs.</span>
          </div>
        ) : (
          filtered.map((ex) => <ExerciseUsageRow key={ex.id} exercise={ex} />)
        )}
      </div>
    </div>
  )
}
