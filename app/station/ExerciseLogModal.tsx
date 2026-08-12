'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { X } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { logExerciseSet } from './actions'

interface LogRow {
  id: string
  reps: number
  weight_lbs: number
  est_1rm: number
  logged_at: string
  notes: string | null
}

function formatDate(iso: unknown) {
  const str = String(iso ?? '')
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

export default function ExerciseLogModal({
  athleteId,
  athleteName,
  workoutExerciseId,
  exerciseName,
  onClose,
}: {
  athleteId: string
  athleteName: string
  workoutExerciseId: string
  exerciseName: string
  onClose: () => void
}) {
  const [tab, setTab] = useState<'enter' | 'history'>('enter')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [history, setHistory] = useState<LogRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  async function loadHistory() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('athlete_exercise_logs')
      .select('id, reps, weight_lbs, est_1rm, logged_at, notes')
      .eq('athlete_id', athleteId)
      .eq('exercise_name', exerciseName)
      .order('logged_at', { ascending: true })
    setHistory((data || []) as LogRow[])
    setHistoryLoading(false)
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  async function handleSave() {
    const repsNum = Number(reps)
    const weightNum = Number(weight)
    if (!repsNum || repsNum <= 0 || isNaN(weightNum) || weightNum < 0) return
    setSaving(true)
    const res = await logExerciseSet({
      workoutExerciseId,
      athleteId,
      reps: repsNum,
      weightLbs: weightNum,
      notes: notes || undefined,
    })
    setSaving(false)
    if (res.success) {
      setReps('')
      setWeight('')
      setNotes('')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <span className="font-bold text-white">{athleteName}</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setTab('enter')}
            className={`flex-1 py-2.5 text-sm font-semibold ${tab === 'enter' ? 'text-white border-b-2 border-red-600' : 'text-slate-500'}`}
          >
            Enter Data
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-2.5 text-sm font-semibold ${tab === 'history' ? 'text-white border-b-2 border-red-600' : 'text-slate-500'}`}
          >
            Recent History
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-7 h-7 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">•</span>
            <span className="font-bold text-white uppercase">{exerciseName}</span>
          </div>

          {tab === 'enter' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Reps</label>
                  <input
                    type="number"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Weight (lbs)</label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600 resize-y"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !reps || !weight}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              {historyLoading && <div className="text-sm text-slate-500">Loading...</div>}
              {!historyLoading && history.length === 0 && (
                <div className="text-sm text-slate-500">No logged sets for this exercise yet.</div>
              )}
              {!historyLoading && history.length > 1 && (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="logged_at" tickFormatter={formatDate} stroke="#94a3b8" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                      <Tooltip
                        labelFormatter={formatDate}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      />
                      <Line type="monotone" dataKey="est_1rm" name="Est. 1RM" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {!historyLoading && history.length > 0 && (
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase">
                        <th className="py-1.5 pr-2">Date</th>
                        <th className="py-1.5 pr-2">Reps</th>
                        <th className="py-1.5 pr-2">Weight</th>
                        <th className="py-1.5">Est. 1RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history
                        .slice()
                        .reverse()
                        .map((h) => (
                          <React.Fragment key={h.id}>
                            <tr className={h.notes ? '' : 'border-b border-slate-800'}>
                              <td className="py-1.5 pr-2 text-slate-400">{formatDate(h.logged_at)}</td>
                              <td className="py-1.5 pr-2 text-slate-200">{h.reps}</td>
                              <td className="py-1.5 pr-2 text-slate-200">{h.weight_lbs}</td>
                              <td className="py-1.5 text-slate-200">{h.est_1rm}</td>
                            </tr>
                            {h.notes && (
                              <tr className="border-b border-slate-800">
                                <td colSpan={4} className="pb-1.5 pt-0 text-xs text-slate-500 italic">
                                  {h.notes}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
