'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { LogOut, ArrowLeft } from 'lucide-react'
import MetricsDashboard, { Metric } from '@/app/components/MetricsDashboard'
import WeeklyVolumeChart from '@/app/components/WeeklyVolumeChart'

export default function AthletePage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [isCoach, setIsCoach] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    async function loadAthleteData() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setUserId(user.id)
        const { data } = await supabase
          .from('performance_metrics')
          .select('test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches')
          .eq('athlete_id', user.id)
          .order('test_date', { ascending: true })

        if (data) {
          setMetrics(data as Metric[])
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, first_name, last_name')
          .eq('id', user.id)
          .single()

        setIsCoach(profile?.role === 'coach' || profile?.role === 'admin')
        setAthleteName(`${profile?.first_name || ''} ${profile?.last_name || ''}`.trim())
      }
      setLoading(false)
    }

    loadAthleteData()
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">
          {athleteName ? `${athleteName} Dashboard` : 'Athlete Performance Dashboard'}
        </h1>
        <div className="flex items-center gap-3">
          {isCoach && (
            <Link
              href="/coach"
              className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Coach Dashboard</span>
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <MetricsDashboard metrics={metrics} loading={loading} />

      {userId && <WeeklyVolumeChart athleteId={userId} />}
    </div>
  )
}
