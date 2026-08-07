'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { LogOut } from 'lucide-react'
import MetricsDashboard, { Metric } from '@/app/components/MetricsDashboard'

interface LinkedAthlete {
  id: string
  name: string
}

export default function ParentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [athletes, setAthletes] = useState<LinkedAthlete[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [metricsLoading, setMetricsLoading] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    async function loadParent() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'parent') {
        router.push('/')
        return
      }

      const { data: links } = await supabase
        .from('parent_athlete_links')
        .select('athlete_id')
        .eq('parent_id', user.id)

      const athleteIds = (links || []).map((l) => l.athlete_id)
      if (athleteIds.length === 0) {
        setAthletes([])
        setLoading(false)
        return
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', athleteIds)

      const loaded = (profiles || []).map((p) => ({
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      }))
      setAthletes(loaded)
      if (loaded.length > 0) setSelectedId(loaded[0].id)
      setLoading(false)
    }

    loadParent()
  }, [router])

  useEffect(() => {
    async function loadMetrics() {
      if (!selectedId) return
      setMetricsLoading(true)
      const { data } = await supabase
        .from('performance_metrics')
        .select('test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches')
        .eq('athlete_id', selectedId)
        .order('test_date', { ascending: true })
      setMetrics((data || []) as Metric[])
      setMetricsLoading(false)
    }
    loadMetrics()
  }, [selectedId])

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Parent Dashboard</h1>
        <button
          onClick={handleSignOut}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      {athletes.length === 0 && (
        <div className="p-8 text-center text-slate-400 rounded-xl border border-slate-800 bg-slate-900">
          No athletes linked to your account yet. Ask your coach for an invite link.
        </div>
      )}

      {athletes.length > 1 && (
        <div className="flex gap-2">
          {athletes.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                selectedId === a.id ? 'border-red-500 bg-red-950/20 text-white' : 'border-slate-800 bg-slate-900 text-slate-400'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {athletes.length === 1 && (
        <h2 className="text-xl font-semibold text-slate-300">{athletes[0].name}</h2>
      )}

      {selectedId && <MetricsDashboard metrics={metrics} loading={metricsLoading} />}
    </div>
  )
}
