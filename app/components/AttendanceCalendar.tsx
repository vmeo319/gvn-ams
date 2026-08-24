'use client'

import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function AttendanceCalendar({ attendedDates }: { attendedDates: Set<string> }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const days = useMemo(() => {
    const year = monthCursor.getFullYear()
    const month = monthCursor.getMonth()
    const startOffset = new Date(year, month, 1).getDay() // 0 = Sunday
    // 6 rows of 7 always covers a month regardless of where it starts/ends.
    return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - startOffset + i))
  }, [monthCursor])

  const currentMonth = monthCursor.getMonth()
  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const isCurrentMonth =
    monthCursor.getFullYear() === new Date().getFullYear() && monthCursor.getMonth() === new Date().getMonth()

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-white">{monthLabel}</span>
        <button
          onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          disabled={isCurrentMonth}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-300 transition disabled:opacity-30 disabled:hover:bg-slate-950"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 uppercase">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const iso = toISODate(d)
          const inMonth = d.getMonth() === currentMonth
          const attended = attendedDates.has(iso)
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium border ${
                !inMonth
                  ? 'border-transparent text-slate-700'
                  : attended
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
