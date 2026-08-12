'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Copy, UserPlus, FileText } from 'lucide-react'
import MetricsDashboard, { Metric, METRIC_INFO } from '@/app/components/MetricsDashboard'
import TrendBadge from '@/app/components/TrendBadge'
import AthleteNotesPanel from '@/app/components/AthleteNotesPanel'
import AthleteWorkoutPanel from '@/app/components/AthleteWorkoutPanel'
import WeeklyVolumeChart from '@/app/components/WeeklyVolumeChart'
import WeightEntryForm from '@/app/components/WeightEntryForm'
import { createParentInviteAction } from '@/app/coach/actions'

export default function CoachAthleteDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const athleteId = params.id

  const [coachId, setCoachId] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [inviteSending, setInviteSending] = useState(false)

  async function loadMetrics() {
    const { data: metricRows } = await supabase
      .from('performance_metrics')
      .select('test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches, weight_lbs')
      .eq('athlete_id', athleteId)
      .order('test_date', { ascending: true })
    setMetrics((metricRows || []) as Metric[])
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
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

      const { data: athlete } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', athleteId)
        .single()
      setAthleteName(`${athlete?.first_name || ''} ${athlete?.last_name || ''}`.trim())

      await loadMetrics()

      setLoading(false)
    }
    load()
  }, [athleteId, router])

  async function handleGenerateInvite() {
    if (!coachId) return
    setInviteSending(true)
    setInviteError('')
    const res = await createParentInviteAction({ athleteId, coachId, email: inviteEmail || undefined })
    setInviteSending(false)
    if (!res.success) {
      setInviteError(res.error || 'Something went wrong.')
      return
    }
    setInviteLink(res.inviteLink || '')
  }

  if (loading || !authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  const pointsFor = (field: keyof Metric) =>
    metrics
      .filter((m) => m[field] !== null && m[field] !== undefined)
      .map((m) => ({ date: m.test_date, value: m[field] as number }))

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">
          {athleteName ? `${athleteName} — Coach View` : 'Athlete Detail'}
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/coach/athlete/${athleteId}/report-card`}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <FileText className="w-4 h-4" />
            <span>Athlete Report Card</span>
          </Link>
          <button
            onClick={() => setInviteOpen((v) => !v)}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Parent</span>
          </button>
          <Link
            href="/coach"
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Roster</span>
          </Link>
        </div>
      </div>

      {inviteOpen && (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Parent email (optional)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none"
            />
            <button
              onClick={handleGenerateInvite}
              disabled={inviteSending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold disabled:opacity-50 transition"
            >
              {inviteSending ? 'Generating...' : 'Generate Link'}
            </button>
          </div>
          {inviteError && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{inviteError}</div>
          )}
          {inviteLink && (
            <div>
              <label className="text-xs font-semibold text-slate-400">Invite Link</label>
              <div className="flex gap-2 mt-1">
                <input
                  readOnly
                  value={inviteLink}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 rounded-lg text-xs font-semibold text-slate-200 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Send this to the parent yourself. It works for a new account or to link an additional child to an existing one.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TrendBadge metricName={METRIC_INFO.iso.name} metricColor={METRIC_INFO.iso.color} points={pointsFor('iso_belt_squat_peak_force')} />
        <TrendBadge metricName={METRIC_INFO.cmj.name} metricColor={METRIC_INFO.cmj.color} points={pointsFor('cmj_height_inches')} />
        <TrendBadge metricName={METRIC_INFO.top_speed.name} metricColor={METRIC_INFO.top_speed.color} points={pointsFor('top_speed')} />
      </div>

      <WeightEntryForm athleteId={athleteId} onLogged={loadMetrics} />

      <MetricsDashboard metrics={metrics} loading={loading} />

      <AthleteWorkoutPanel athleteId={athleteId} coachId={coachId!} />

      <WeeklyVolumeChart athleteId={athleteId} />

      <AthleteNotesPanel athleteId={athleteId} authorId={coachId!} />
    </div>
  )
}
