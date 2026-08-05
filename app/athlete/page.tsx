'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { LogOut, ArrowLeft } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

interface Metric {
  test_date: string
  iso_belt_squat_peak_force: number | null
  v0_speed: number | null
  cmj_height_inches: number | null
}

export default function AthletePage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<'iso' | 'v0' | 'cmj'>('iso')
  const [isCoach, setIsCoach] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }


  useEffect(() => {
    async function loadAthleteData() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data } = await supabase
          .from('performance_metrics')
          .select('test_date, iso_belt_squat_peak_force, v0_speed, cmj_height_inches')
          .eq('athlete_id', user.id)
          .order('test_date', { ascending: true })

        if (data) {
          setMetrics(data as Metric[])
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        setIsCoach(profile?.role === 'coach' || profile?.role === 'admin')
      }
      setLoading(false)
    }

    loadAthleteData()
  }, [supabase])

  const maxV0 = metrics.length ? Math.max(...metrics.map(m => m.v0_speed || 0)) : 0
  const maxIso = metrics.length ? Math.max(...metrics.map(m => m.iso_belt_squat_peak_force || 0)) : 0
  const maxJump = metrics.length ? Math.max(...metrics.map(m => m.cmj_height_inches || 0)) : 0

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading performance profile...</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Athlete Performance Dashboard</h1>
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

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => setSelectedMetric('iso')}
          className={`p-5 rounded-xl border cursor-pointer transition ${selectedMetric === 'iso' ? 'border-red-500 bg-red-950/20' : 'border-slate-800 bg-slate-900'}`}
        >
          <div className="text-sm font-medium text-slate-400">Peak ISO Force</div>
          {/* Direct N/kg rendering - no division */}
          <div className="text-3xl font-bold text-red-500 mt-1">
            {maxIso > 0 ? `${maxIso.toFixed(1)} N/kg` : '--'}
          </div>
        </div>

        <div 
          onClick={() => setSelectedMetric('cmj')}
          className={`p-5 rounded-xl border cursor-pointer transition ${selectedMetric === 'cmj' ? 'border-blue-500 bg-blue-950/20' : 'border-slate-800 bg-slate-900'}`}
        >
          <div className="text-sm font-medium text-slate-400">Max Vertical Jump</div>
          <div className="text-3xl font-bold text-blue-500 mt-1">
            {maxJump > 0 ? `${maxJump.toFixed(1)} in` : '--'}
          </div>
        </div>

        <div 
          onClick={() => setSelectedMetric('v0')}
          className={`p-5 rounded-xl border cursor-pointer transition ${selectedMetric === 'v0' ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-800 bg-slate-900'}`}
        >
          <div className="text-sm font-medium text-slate-400">Max Sprint V0</div>
          <div className="text-3xl font-bold text-emerald-500 mt-1">
            {maxV0 > 0 ? `${maxV0.toFixed(2)} m/s` : '--'}
          </div>
        </div>
      </div>

      {/* Progress Chart */}
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900">
        <h2 className="text-lg font-semibold mb-4">Performance Trends</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="test_date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
              />
              
              {selectedMetric === 'iso' && (
                <Line 
                  type="monotone" 
                  dataKey="iso_belt_squat_peak_force" 
                  name="ISO Force (N/kg)" 
                  stroke="#ef4444" 
                  strokeWidth={3} 
                  dot={{ r: 5 }} 
                />
              )}

              {selectedMetric === 'cmj' && (
                <Line 
                  type="monotone" 
                  dataKey="cmj_height_inches" 
                  name="CMJ Jump (in)" 
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  dot={{ r: 5 }} 
                />
              )}

              {selectedMetric === 'v0' && (
                <Line 
                  type="monotone" 
                  dataKey="v0_speed" 
                  name="V0 Speed (m/s)" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 5 }} 
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}