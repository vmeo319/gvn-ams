'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface AthleteLeaderboard {
  athlete_id: string
  first_name: string
  last_name: string
  birth_year: number
  position: string
  height_inches: number
  weight_lbs: number
  iso_relative_peak_force_n_kg: number
  v0: number
  top_speed: number
  max_jump_height: number
  workout_level: string
  sprint_level: string
}

export default function CoachDashboard() {
  const [data, setData] = useState<AthleteLeaderboard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeaderboard() {
      const { data: records, error } = await supabase
        .from('coach_365d_leaderboard')
        .select('*')
      
      if (error) {
        // Print the specific error message instead of an empty object
        console.error('Error loading leaderboard:', error.message || error)
      } else {
        setData(records || [])
      }
      setLoading(false)
    }

    fetchLeaderboard()
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">GVN PERFORMANCE</h1>
          <p className="text-slate-400 text-sm">365-Day Coach Summary Leaderboard</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-lg text-xs font-semibold text-slate-300">
          COACH ACCESS ONLY
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="text-slate-400">Loading athlete metrics from Supabase...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur shadow-2xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/80 text-slate-400 uppercase text-xs tracking-wider border-b border-slate-700">
              <tr>
                <th className="py-4 px-4">Athlete</th>
                <th className="py-4 px-4">Info</th>
                <th className="py-4 px-4">Ht / Wt</th>
                <th className="py-4 px-4">ISO Rel Peak Force</th>
                <th className="py-4 px-4">V0 (m/s)</th>
                <th className="py-4 px-4">Top Speed</th>
                <th className="py-4 px-4">Max Jump</th>
                <th className="py-4 px-4">Workout Level</th>
                <th className="py-4 px-4">Sprint Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {data.map((athlete) => (
                <tr key={athlete.athlete_id} className="hover:bg-slate-800/40 transition">
                  <td className="py-4 px-4 font-bold text-white">
                    {athlete.last_name}, {athlete.first_name}
                  </td>
                  <td className="py-4 px-4 text-slate-400">
                    '{athlete.birth_year ? String(athlete.birth_year).slice(-2) : 'N/A'} | {athlete.position}
                  </td>
                  <td className="py-4 px-4 text-slate-300">
                    {athlete.height_inches}" / {athlete.weight_lbs} lbs
                  </td>
                  <td className="py-4 px-4 text-cyan-400 font-semibold">
                    {athlete.iso_relative_peak_force_n_kg} N/kg
                  </td>
                  <td className="py-4 px-4 text-slate-200">{athlete.v0}</td>
                  <td className="py-4 px-4 text-slate-200">{athlete.top_speed} m/s</td>
                  <td className="py-4 px-4 text-slate-200">{athlete.max_jump_height}"</td>
                  
                  {/* Workout Level Badge */}
                  <td className="py-4 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      athlete.workout_level === 'Level 3' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {athlete.workout_level}
                    </span>
                  </td>

                  {/* Sprint Level Badge */}
                  <td className="py-4 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      athlete.sprint_level === 'Level 2' 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {athlete.sprint_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}