'use client'

import React from 'react'
import { RangePreset, rangePresets } from '@/lib/dateRanges'

// Preset buttons plus from/to inputs for a custom range. Controlled: the parent keeps the
// preset and custom dates, and derives the range with presetRange().
export default function DateRangeFilter({
  preset,
  onPreset,
  customStart,
  customEnd,
  onCustomStart,
  onCustomEnd,
}: {
  preset: RangePreset
  onPreset: (p: RangePreset) => void
  customStart: string
  customEnd: string
  onCustomStart: (v: string) => void
  onCustomEnd: (v: string) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        {rangePresets().map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              preset === p.key ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => onCustomStart(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white [color-scheme:dark]"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            onChange={(e) => onCustomEnd(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white [color-scheme:dark]"
          />
        </div>
      )}
    </>
  )
}
