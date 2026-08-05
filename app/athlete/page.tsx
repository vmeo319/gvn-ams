'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { LogOut, ArrowLeft } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

interface Metric {
  test_date: string
  iso_belt_squat_peak_force: number | null
  top_speed: number | null
  cmj_height_inches: number | null
}

type MetricKey = 'iso' | 'cmj' | 'top_speed'

const METRIC_INFO: Record<MetricKey, { field: keyof Metric; name: string; unit: string; color: string; decimals: number }> = {
  iso: { field: 'iso_belt_squat_peak_force', name: 'ISO Force (N/kg)', unit: 'N/kg', color: '#ef4444', decimals: 1 },
  cmj: { field: 'cmj_height_inches', name: 'Jump Height (in)', unit: 'in', color: '#3b82f6', decimals: 2 },
  top_speed: { field: 'top_speed', name: 'Top Speed (mph)', unit: 'mph', color: '#10b981', decimals: 2 },
}

function formatTickDate(dateStr: unknown): string {
  const str = String(dateStr ?? '')
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AthletePage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('iso')
  const [isCoach, setIsCoach] = useState(false)
  const [athleteName, setAthleteName] = useState('')

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
  }, [supabase])

  const maxTopSpeed = metrics.length ? Math.max(...metrics.map(m => m.top_speed || 0)) : 0
  const maxIso = metrics.length ? Math.max(...metrics.map(m => m.iso_belt_squat_peak_force || 0)) : 0
  const maxJump = metrics.length ? Math.max(...metrics.map(m => m.cmj_height_inches || 0)) : 0

  // Only the dates where the currently selected metric actually has a value — this keeps
  // every plotted point genuinely connected (no gaps from other metrics' null entries)
  // and keeps the x-axis from being crowded with irrelevant dates.
  const chartData = useMemo(() => {
    const field = METRIC_INFO[selectedMetric].field
    return metrics
      .filter((m) => m[field] !== null && m[field] !== undefined)
      .map((m) => ({ test_date: m.test_date, value: m[field] as number }))
  }, [metrics, selectedMetric])

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading performance profile...</div>
  }

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

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => setSelectedMetric('iso')}
          className={`p-5 rounded-xl border cursor-pointer transition ${selectedMetric === 'iso' ? 'border-red-500 bg-red-950/20' : 'border-slate-800 bg-slate-900'}`}
        >
          <div className="text-sm font-medium text-slate-400">ISO Relative Peak Force</div>
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
            {maxJump > 0 ? `${maxJump.toFixed(2)} in` : '--'}
          </div>
        </div>

        <div
          onClick={() => setSelectedMetric('top_speed')}
          className={`p-5 rounded-xl border cursor-pointer transition ${selectedMetric === 'top_speed' ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-800 bg-slate-900'}`}
        >
          <div className="text-sm font-medium text-slate-400">Max Top Speed</div>
          <div className="text-3xl font-bold text-emerald-500 mt-1">
            {maxTopSpeed > 0 ? `${maxTopSpeed.toFixed(2)} mph` : '--'}
          </div>
        </div>
      </div>

      {/* Progress Chart */}
      <div className="p-6 rounded-xl border border-slate-800 bg-slate-900">
        <h2 className="text-lg font-semibold mb-4">Performance Trends</h2>
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="test_date"
                stroke="#94a3b8"
                tickFormatter={formatTickDate}
                angle={-40}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={formatTickDate}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={METRIC_INFO[selectedMetric].name}
                stroke={METRIC_INFO[selectedMetric].color}
                strokeWidth={3}
                dot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
