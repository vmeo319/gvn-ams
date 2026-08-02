'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { createAthleteAction } from './actions'

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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Form State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthYear, setBirthYear] = useState('2006')
  const [position, setPosition] = useState('F')
  const [heightInches, setHeightInches] = useState('72')
  const [weightLbs, setWeightLbs] = useState('185')

  const fetchLeaderboard = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('coach_365d_leaderboard')
      .select('*')
    
    if (error) console.error('Error loading leaderboard:', error.message || error)
    else setData(records || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const handleCreateAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormLoading(true)
    setFormError('')

    const result = await createAthleteAction({
      email,
      password,
      firstName,
      lastName,
      birthYear: parseInt(birthYear),
      position,
      heightInches: parseInt(heightInches),
      weightLbs: parseInt(weightLbs),
    })

    if (!result.success) {
      setFormError(result.error || 'Failed to create athlete')
      setFormLoading(false)
    } else {
      // Reset form and close modal
      setEmail('')
      setPassword('')
      setFirstName('')
      setLastName('')
      setIsModalOpen(false)
      setFormLoading(false)
      fetchLeaderboard() // Refresh table
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-slate-800 pb-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">GVN PERFORMANCE</h1>
          <p className="text-slate-400 text-sm">365-Day Coach Summary Leaderboard</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20"
          >
            + Add New Athlete
          </button>
          <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400">
            COACH ACCESS
          </div>
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
                    {athlete.iso_relative_peak_force_n_kg || '-'} N/kg
                  </td>
                  <td className="py-4 px-4 text-slate-200">{athlete.v0 || '-'}</td>
                  <td className="py-4 px-4 text-slate-200">{athlete.top_speed ? `${athlete.top_speed} m/s` : '-'}</td>
                  <td className="py-4 px-4 text-slate-200">{athlete.max_jump_height ? `${athlete.max_jump_height}"` : '-'}</td>
                  
                  <td className="py-4 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      athlete.workout_level === 'Level 3' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {athlete.workout_level || 'Level 1+2'}
                    </span>
                  </td>

                  <td className="py-4 px-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      athlete.sprint_level === 'Level 2' 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {athlete.sprint_level || 'Level 1'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Athlete Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Add New GVN Athlete</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg text-center">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAthlete} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Athlete Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="athlete@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Temporary Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Birth Yr</label>
                  <input
                    type="number"
                    required
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Pos</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                  >
                    <option value="F">F</option>
                    <option value="D">D</option>
                    <option value="G">G</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Ht (in)</label>
                  <input
                    type="number"
                    required
                    value={heightInches}
                    onChange={(e) => setHeightInches(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Wt (lbs)</label>
                  <input
                    type="number"
                    required
                    value={weightLbs}
                    onChange={(e) => setWeightLbs(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-1/2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
                >
                  {formLoading ? 'Creating...' : 'Save Athlete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}