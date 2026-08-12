'use client'

import React, { useState } from 'react'
import { logManualWeight } from './metricsActions'

export default function WeightEntryForm({ athleteId, onLogged }: { athleteId: string; onLogged: () => void }) {
  const [open, setOpen] = useState(false)
  const [weight, setWeight] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const weightNum = Number(weight)
    if (!weightNum || weightNum <= 0) return
    setSaving(true)
    const res = await logManualWeight({ athleteId, weightLbs: weightNum, testDate: date })
    setSaving(false)
    if (res.success) {
      setWeight('')
      setOpen(false)
      onLogged()
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
      >
        Log Weight
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-800 bg-slate-900">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
      />
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="Weight (lbs)"
        className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
      />
      <button
        onClick={handleSave}
        disabled={saving || !weight}
        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition"
      >
        Cancel
      </button>
    </div>
  )
}
