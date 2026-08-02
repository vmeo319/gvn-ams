'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface MetricRecord {
  test_date: string
  iso_belt_squat_peak_force: number
  v0_speed: number
  cmj_height_inches: number
  body_weight_lbs: number
}

interface Profile {
  first_name: string
  last_name: string
}

export default function AthleteDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [metrics, setMetrics] = useState<MetricRecord[]>([])
  const [selectedMetric, setSelectedMetric] = useState<'iso' | 'v0' | 'cmj'>('v0')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function loadAthleteData() {
      // 1. Get current logged in user session
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/')
        return
      }

      // 2. Fetch Profile Info
      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      // 3. Fetch historic metrics for THIS athlete only
      const { data: testData } = await supabase
        .from('performance_metrics')
        .select('test_date, iso_belt_squat_peak_force, v0_speed, cmj_height_inches, body_weight_lbs')
        .eq('athlete_id', user.id)
        .order('test_date', { ascending: true })

      setMetrics(testData || [])
      setLoading(false)
    }

    loadAthleteData()
  }, [router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Calculate Personal Bests
  const maxV0 = metrics.length ? Math.max(...metrics.map(m => m.v0_speed || 0)) : 0
  const maxIso = metrics.length ? Math.max(...metrics.map(m => m.iso_belt_squat_peak_force || 0)) : 0
  const maxJump = metrics.length ? Math.max(...metrics.map(m => m.cmj_height_inches || 0)) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div>
          <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">GVN Athlete Portal</span>
          <h1 className="text-2xl font-black text-white">
            {profile ? `${profile.first_name} ${profile.last_name}` : 'My Progress'}
          </h1>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold px-3 py-2 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">Loading your personal dashboard...</div>
      ) : (
        <div className="space-y-6">
          {/* PR Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-400 uppercase">Top Speed (V0)</span>
              <div className="text-3xl font-black text-cyan-400 mt-1">{maxV0} <span className="text-sm font-normal text-slate-400">m/s</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-400 uppercase">ISO Peak Force</span>
              <div className="text-3xl font-black text-emerald-400 mt-1">{maxIso} <span className="text-sm font-normal text-slate-400">N</span></div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <span className="text-xs font-bold text-slate-400 uppercase">Max Jump Height</span>
              <div className="text-3xl font-black text-indigo-400 mt-1">{maxJump}"</div>
            </div>
          </div>

          {/* Interactive Trendline Graph */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">Progress Trendline</h2>
                <p className="text-xs text-slate-400">Track your development across testing sessions</p>
              </div>

              {/* Metric Selector Buttons */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setSelectedMetric('v0')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${selectedMetric === 'v0' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  Top Speed (V0)
                </button>
                <button
                  onClick={() => setSelectedMetric('iso')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${selectedMetric === 'iso' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  ISO Belt Squat
                </button>
                <button
                  onClick={() => setSelectedMetric('cmj')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${selectedMetric === 'cmj' ? 'bg-indigo-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  CMJ Height
                </button>
              </div>
            </div>

            {/* Recharts Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="test_date" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                  />
                  {selectedMetric === 'v0' && (
                    <Line type="monotone" dataKey="v0_speed" name="V0 Speed (m/s)" stroke="#22d3ee" strokeWidth={3} dot={{ r: 5 }} />
                  )}
                  {selectedMetric === 'iso' && (
                    <Line type="monotone" dataKey="iso_belt_squat_peak_force" name="ISO Force (N)" stroke="#34d399" strokeWidth={3} dot={{ r: 5 }} />
                  )}
                  {selectedMetric === 'cmj' && (
                    <Line type="monotone" dataKey="cmj_height_inches" name="Jump Height (in)" stroke="#818cf8" strokeWidth={3} dot={{ r: 5 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}