'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { createWorkout } from './actions'
import { useWorkoutLocation } from '@/lib/useWorkoutLocation'
import LocationPicker from './LocationPicker'
import ExerciseBankTab from './ExerciseBankTab'
import DeleteWorkoutModal from './DeleteWorkoutModal'

interface WorkoutRow {
  id: string
  name: string
  status: 'draft' | 'active'
  updated_at: string
}

export default function WorkoutsListPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'active'>('all')
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<'workouts' | 'bank'>('workouts')
  const { locations, locationId, setLocationId } = useWorkoutLocation()
  const [deleteTarget, setDeleteTarget] = useState<WorkoutRow | null>(null)

  async function loadWorkouts() {
    const { data } = await supabase
      .from('workouts')
      .select('id, name, status, updated_at')
      .order('updated_at', { ascending: false })
    setWorkouts((data || []) as WorkoutRow[])
    setLoading(false)
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
      setCoachId(user.id)
      setAuthorized(true)
      await loadWorkouts()
    }
    init()
  }, [router])

  async function handleCreate() {
    if (!coachId) return
    setCreating(true)
    const res = await createWorkout({ createdBy: coachId })
    setCreating(false)
    if (res.success && res.workoutId) {
      router.push(`/coach/workouts/${res.workoutId}`)
    }
  }

  const filtered = workouts
    .filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
    .filter((w) => statusFilter === 'all' || w.status === statusFilter)

  if (!authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Workouts</h1>
        <div className="flex items-center gap-3">
          {tab === 'workouts' && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Creating...' : 'New Workout'}</span>
            </button>
          )}
          <Link
            href="/coach"
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {(['workouts', 'bank'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t ? 'bg-red-950/30 text-white border border-red-500' : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {t === 'workouts' ? 'Workouts' : 'Exercise Bank'}
            </button>
          ))}
        </div>
        {tab === 'bank' && (
          <LocationPicker locations={locations} locationId={locationId} onChange={setLocationId} />
        )}
      </div>

      {tab === 'bank' ? (
        <ExerciseBankTab locationId={locationId} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search workouts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-600"
            />
            {(['all', 'active', 'draft'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition capitalize ${
                  statusFilter === s ? 'border-red-500 bg-red-950/20 text-white' : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
            {loading && <div className="p-6 text-center text-slate-400">Loading workouts...</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-6 text-center text-slate-400">No workouts found.</div>
            )}
            {filtered.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition">
                <Link href={`/coach/workouts/${w.id}`} className="flex-1 flex items-center gap-3">
                  <span className="font-semibold text-white">{w.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                      w.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {w.status}
                  </span>
                </Link>
                <button
                  onClick={() => setDeleteTarget(w)}
                  title="Delete workout"
                  className="p-2 rounded-lg hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {deleteTarget && (
        <DeleteWorkoutModal
          workout={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null)
            loadWorkouts()
          }}
        />
      )}
    </div>
  )
}
