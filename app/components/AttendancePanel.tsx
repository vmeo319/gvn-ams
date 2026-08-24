'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { getAthleteAttendedDates, setAttendanceAction } from '@/app/coach/groups/actions'
import AttendanceCalendar from './AttendanceCalendar'

export default function AttendancePanel({ athleteId, coachId }: { athleteId: string; coachId: string }) {
  const [sinceISO, setSinceISO] = useState('')
  const [dates, setDates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [pendingDate, setPendingDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await getAthleteAttendedDates({ athleteId, sinceISO: sinceISO || undefined })
      if (!cancelled && res.success) setDates(res.dates as string[])
      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [athleteId, sinceISO])

  const attendedSet = useMemo(() => new Set(dates), [dates])

  async function handleDayClick(dateISO: string) {
    const wasPresent = attendedSet.has(dateISO)
    const next = !wasPresent
    setPendingDate(dateISO)
    setDates((prev) => (next ? [...prev, dateISO] : prev.filter((d) => d !== dateISO)))
    const res = await setAttendanceAction({ athleteId, date: dateISO, present: next, markedBy: coachId })
    setPendingDate(null)
    if (!res.success) {
      setDates((prev) => (wasPresent ? [...prev, dateISO] : prev.filter((d) => d !== dateISO)))
    }
  }

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-slate-500 shrink-0" />
          <div>
            <div className="text-sm font-medium text-slate-400">Days Attended</div>
            <div className="text-2xl font-bold text-white">{loading ? '--' : dates.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-500" htmlFor="attendance-since">
            Since
          </label>
          <input
            id="attendance-since"
            type="date"
            value={sinceISO}
            onChange={(e) => setSinceISO(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-red-600"
          />
          {sinceISO && (
            <button onClick={() => setSinceISO('')} className="text-xs text-slate-500 hover:text-slate-300 transition">
              Clear
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <span>Calendar</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <>
          <AttendanceCalendar attendedDates={attendedSet} onDayClick={handleDayClick} pendingDate={pendingDate} />
          <p className="text-[11px] text-slate-500">
            Click a day to mark it attended, click again to clear it — works even if this athlete isn't in a group.
          </p>
        </>
      )}
      <p className="text-[11px] text-slate-500">
        Counts a day once even if the athlete is in multiple groups. Useful as a billing reference — set "Since" to a
        billing period's start date, or leave blank for all-time.
      </p>
    </div>
  )
}
