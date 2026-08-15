'use client'

import React from 'react'
import { MapPin } from 'lucide-react'
import { WorkoutLocationOption } from '@/lib/useWorkoutLocation'

export default function LocationPicker({
  locations,
  locationId,
  onChange,
}: {
  locations: WorkoutLocationOption[]
  locationId: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
      <MapPin className="w-4 h-4 text-red-500 shrink-0" />
      <select
        value={locationId || ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm text-slate-200 focus:outline-none"
      >
        {locations.length === 0 && <option value="">Loading...</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id} className="bg-slate-900">{l.name}</option>
        ))}
      </select>
    </div>
  )
}
