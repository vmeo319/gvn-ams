'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import { getGroupDetail, getWeekAttendance, setAttendanceAction } from '../actions'

interface Member {
  id: string
  firstName: string
  lastName: string
}

// Attendance is a wall-clock concept — a coach checking someone off on "Monday" means
// their local Monday, not a UTC one. Mixing UTC date construction with toLocaleDateString's
// local-time weekday formatting (the original version of this file did exactly that) shifts
// every label by a day in any timezone behind UTC, since a UTC-midnight instant reads as the
// previous evening locally. Keeping everything in local date components end to end avoids
// the mismatch entirely.
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

export default function GroupDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const groupId = params.id

  const [authorized, setAuthorized] = useState(false)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map())
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekStartISO = toISODate(weekStart)
  const isCurrentWeek = weekStartISO === toISODate(mondayOf(new Date()))

  async function loadGroup() {
    const res = await getGroupDetail({ groupId })
    if (res.success) {
      setGroupName(res.group!.name)
      setMembers(res.members as Member[])
    }
  }

  async function loadAttendance() {
    const res = await getWeekAttendance({ groupId, weekStartISO })
    const map = new Map<string, boolean>()
    if (res.success) {
      for (const row of res.results as { athlete_id: string; attendance_date: string; present: boolean }[]) {
        map.set(`${row.athlete_id}_${row.attendance_date}`, row.present)
      }
    }
    setAttendance(map)
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
      await loadGroup()
      setLoading(false)
    }
    init()
  }, [groupId, router])

  useEffect(() => {
    if (authorized) loadAttendance()
  }, [authorized, weekStartISO])

  async function toggleAttendance(athleteId: string, dateISO: string) {
    if (!coachId) return
    const key = `${athleteId}_${dateISO}`
    const current = attendance.get(key)
    const next = current !== true // unmarked or absent -> present; present -> absent
    setSavingKey(key)
    setAttendance((prev) => new Map(prev).set(key, next))
    const res = await setAttendanceAction({ groupId, athleteId, date: dateISO, present: next, markedBy: coachId })
    setSavingKey(null)
    if (!res.success) {
      // revert on failure
      setAttendance((prev) => new Map(prev).set(key, current === undefined ? false : current))
    }
  }

  if (loading || !authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">{groupName}</h1>
        <Link
          href="/coach/groups"
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Groups</span>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Attendance</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-300 font-medium min-w-[150px] text-center">
            {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
            {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekStart(mondayOf(new Date()))}
              className="ml-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500 bg-red-950/20 text-white transition"
            >
              This Week
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-5">Athlete</th>
                {weekDates.map((d) => (
                  <th key={toISODate(d)} className="py-3 px-2 text-center">
                    <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className="text-slate-600 font-normal normal-case">{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No athletes in this group yet. Add some from the coach dashboard.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-5 font-semibold text-white whitespace-nowrap">
                      {m.firstName} {m.lastName}
                    </td>
                    {weekDates.map((d) => {
                      const dateISO = toISODate(d)
                      const key = `${m.id}_${dateISO}`
                      const present = attendance.get(key)
                      const saving = savingKey === key
                      return (
                        <td key={dateISO} className="py-2 px-2 text-center">
                          <button
                            onClick={() => toggleAttendance(m.id, dateISO)}
                            disabled={saving}
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center mx-auto transition disabled:opacity-50 ${
                              present === true
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : present === false
                                ? 'bg-red-950/40 border-red-800 text-red-400'
                                : 'bg-slate-950 border-slate-700 text-transparent hover:border-slate-500'
                            }`}
                          >
                            {present === true ? <Check className="w-4 h-4" /> : present === false ? <X className="w-4 h-4" /> : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-500">Tap a box to cycle: unmarked → present → absent → present...</p>
    </div>
  )
}
