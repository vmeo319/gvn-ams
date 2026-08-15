'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getWorkoutDeletionImpact, deleteWorkout } from './actions'

interface WorkoutRow {
  id: string
  name: string
  status: 'draft' | 'active'
}

export default function DeleteWorkoutModal({
  workout,
  onClose,
  onDeleted,
}: {
  workout: WorkoutRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [assignedCount, setAssignedCount] = useState(0)
  const [historicalAthleteCount, setHistoricalAthleteCount] = useState(0)
  const [acknowledged, setAcknowledged] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await getWorkoutDeletionImpact({ workoutId: workout.id })
      if (cancelled) return
      if (res.success) {
        setAssignedCount(res.assignedCount)
        setHistoricalAthleteCount(res.historicalAthleteCount)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [workout.id])

  const nameMatches = typedName.trim().toLowerCase() === workout.name.trim().toLowerCase()
  const canDelete = acknowledged && nameMatches && !deleting

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    setError('')
    const res = await deleteWorkout({ workoutId: workout.id })
    setDeleting(false)
    if (!res.success) {
      setError(res.error || 'Failed to delete workout.')
      return
    }
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-red-950/60">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Delete "{workout.name}"?</h3>
            <p className="text-xs text-slate-500">This permanently deletes the entire program and cannot be undone.</p>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">Checking who's affected...</div>
        ) : (
          (assignedCount > 0 || historicalAthleteCount > 0) && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-xs text-red-300 space-y-1">
              {assignedCount > 0 && (
                <div>{assignedCount} athlete{assignedCount === 1 ? ' is' : 's are'} currently assigned to this workout — they'll be unassigned.</div>
              )}
              {historicalAthleteCount > 0 && (
                <div>{historicalAthleteCount} athlete{historicalAthleteCount === 1 ? '' : 's'} {historicalAthleteCount === 1 ? 'has' : 'have'} historical training records on this workout — those records will be erased too.</div>
              )}
            </div>
          )
        )}

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>
        )}

        <div className="space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-red-600 w-4 h-4 shrink-0"
            />
            <span className="text-sm text-slate-300">I understand this cannot be undone.</span>
          </label>

          <div>
            <label className="text-xs font-semibold text-slate-400">
              Type <span className="text-white font-bold">{workout.name}</span> to confirm
            </label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={workout.name}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete Workout'}
          </button>
        </div>
      </div>
    </div>
  )
}
