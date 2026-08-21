'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Trophy, Medal, Crown, MapPin, Calendar } from 'lucide-react'

interface MetricOption {
  key: string
  column: string
  label: string
  unit: string
  decimals: number
}

const METRICS: MetricOption[] = [
  { key: 'iso', column: 'iso_belt_squat_peak_force', label: 'Peak ISO Force', unit: 'N/kg', decimals: 1 },
  { key: 'cmj', column: 'cmj_height_inches', label: 'Jump Height (CMJ)', unit: 'in', decimals: 2 },
  { key: 'v0', column: 'v0_speed', label: 'Sprint V0 Speed', unit: 'mph', decimals: 2 },
  { key: 'top_speed', column: 'top_speed', label: '10yd Top Speed', unit: 'mph', decimals: 2 },
  { key: 'broad_jump', column: 'broad_jump_inches', label: 'Broad Jump', unit: 'in', decimals: 1 },
  { key: 'bench', column: 'bench_press_velo_mps', label: 'Bench Press Velocity', unit: 'm/s', decimals: 2 },
  { key: 'chinups', column: 'chin_ups_reps', label: 'Chin-Ups', unit: 'reps', decimals: 0 },
]

interface LocationRow {
  id: string
  name: string
}

interface RankedAthlete {
  athleteId: string
  name: string
  location: string
  value: number
  testDate: string
}

function toDateInput(d: Date): string {
  return d.toISOString().split('T')[0]
}

// Supabase/PostgREST silently caps responses at a default row limit (1000) regardless of
// how many rows actually match — a wider date range can come back with FEWER rows than a
// narrower one once the true count crosses that cap, which was producing lower "max"
// values for wider windows. Page through with .range() until a page comes back short.
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000
  let allRows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error || !data) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

export default function LeaderboardsPage() {
  const [metricKey, setMetricKey] = useState('iso')
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [locationId, setLocationId] = useState('')
  const [startDate, setStartDate] = useState(toDateInput(new Date(Date.now() - 29 * 86400000)))
  const [endDate, setEndDate] = useState(toDateInput(new Date()))
  const [results, setResults] = useState<RankedAthlete[]>([])
  const [loading, setLoading] = useState(true)

  const metric = METRICS.find((m) => m.key === metricKey)!

  useEffect(() => {
    fetchLocations()
  }, [])

  useEffect(() => {
    if (locations.length > 0 || locations.length === 0) {
      fetchLeaderboard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey, locationId, startDate, endDate, locations])

  const fetchLocations = async () => {
    const { data } = await supabase.from('locations').select('id, name').neq('name', 'GVN-Coaches').order('name')
    setLocations((data || []) as LocationRow[])
  }

  const setPreset = (days: number) => {
    setEndDate(toDateInput(new Date()))
    setStartDate(toDateInput(new Date(Date.now() - (days - 1) * 86400000)))
  }

  const fetchLeaderboard = async () => {
    setLoading(true)

    const profiles = await fetchAllRows((from, to) =>
      supabase
        .from('profiles')
        .select('id, first_name, last_name, location_id')
        .eq('role', 'athlete')
        .range(from, to)
    )

    const profileMap = new Map<string, { name: string; locationId: string | null }>()
    profiles.forEach((p: any) => {
      profileMap.set(p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), locationId: p.location_id })
    })

    const metricRows = await fetchAllRows((from, to) =>
      supabase
        .from('performance_metrics')
        .select(`athlete_id, test_date, ${metric.column}`)
        .gte('test_date', startDate)
        .lte('test_date', endDate)
        .not(metric.column, 'is', null)
        .range(from, to)
    )

    const locationNameMap = new Map(locations.map((l) => [l.id, l.name]))
    const best = new Map<string, RankedAthlete>()

    metricRows.forEach((row: any) => {
      const profile = profileMap.get(row.athlete_id)
      if (!profile) return
      if (locationId && profile.locationId !== locationId) return

      const value = Number(row[metric.column])
      if (isNaN(value)) return

      const existing = best.get(row.athlete_id)
      if (!existing || value > existing.value) {
        best.set(row.athlete_id, {
          athleteId: row.athlete_id,
          name: profile.name || 'Unknown Athlete',
          location: (profile.locationId && locationNameMap.get(profile.locationId)) || '—',
          value,
          testDate: row.test_date,
        })
      }
    })

    const ranked = Array.from(best.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

    setResults(ranked)
    setLoading(false)
  }

  const podium = results.slice(0, 3)
  const rest = results.slice(3)
  const podiumOrder = [podium[1], podium[0], podium[2]]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <div className="max-w-5xl mx-auto w-full p-6 md:p-10 space-y-8 flex-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center space-x-4">
            <div className="relative w-14 h-14 shrink-0">
              <Image src="/gvn-logo-wolf.png" alt="GVN Wolf Logo" fill sizes="56px" className="object-contain" priority />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Trophy className="w-7 h-7 text-amber-400" />
                Leaderboards
              </h1>
              <p className="text-sm text-slate-400">GVN Performance • Ranked by any metric, any window, any facility</p>
            </div>
          </div>
          <Link
            href="/coach"
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2.5 rounded-lg border border-slate-800 transition text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Metric</div>
            <div className="flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetricKey(m.key)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                    metricKey === m.key
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Date Range
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => setPreset(7)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600 transition"
                >
                  Past Week
                </button>
                <button
                  onClick={() => setPreset(30)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600 transition"
                >
                  Past Month
                </button>
                <button
                  onClick={() => setPreset(365)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-600 transition"
                >
                  Past Year
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
                <span className="text-slate-500 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Facility
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setLocationId('')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                    locationId === ''
                      ? 'bg-red-600 border-red-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  All Locations
                </button>
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setLocationId(loc.id)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                      locationId === loc.id
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="text-center text-slate-500 py-16">Loading leaderboard...</div>
        ) : results.length === 0 ? (
          <div className="text-center text-slate-500 py-16 border border-slate-800 rounded-2xl bg-slate-900">
            No {metric.label.toLowerCase()} data in this range{locationId ? ' for this facility' : ''}.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Podium */}
            {podium.length > 0 && (
              <div className="grid grid-cols-3 gap-3 md:gap-4 items-end">
                {podiumOrder.map((athlete, idx) => {
                  if (!athlete) return <div key={idx} />
                  const place = idx === 1 ? 1 : idx === 0 ? 2 : 3
                  const heights = { 1: 'h-40 md:h-48', 2: 'h-32 md:h-36', 3: 'h-24 md:h-28' }
                  const colors = {
                    1: 'from-amber-500/30 to-amber-500/5 border-amber-500/60',
                    2: 'from-slate-400/25 to-slate-400/5 border-slate-400/50',
                    3: 'from-orange-700/25 to-orange-700/5 border-orange-700/50',
                  }
                  const badge = {
                    1: <Crown className="w-6 h-6 text-amber-400" />,
                    2: <Medal className="w-5 h-5 text-slate-300" />,
                    3: <Medal className="w-5 h-5 text-orange-500" />,
                  }
                  return (
                    <div key={athlete.athleteId} className="flex flex-col items-center">
                      <div className="mb-2">{badge[place as 1 | 2 | 3]}</div>
                      <div className="text-sm font-bold text-white text-center leading-tight mb-1 px-1">{athlete.name}</div>
                      <div className="text-xs text-slate-400 mb-2">{athlete.location}</div>
                      <div
                        className={`w-full ${heights[place as 1 | 2 | 3]} rounded-t-xl border bg-gradient-to-b ${colors[place as 1 | 2 | 3]} flex flex-col items-center justify-center`}
                      >
                        <div className="text-2xl md:text-3xl font-extrabold text-white">
                          {athlete.value.toFixed(metric.decimals)}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-300">{metric.unit}</div>
                        <div className="text-[10px] text-slate-400 mt-1">#{place}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 4-10 */}
            {rest.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {rest.map((athlete, idx) => (
                  <div
                    key={athlete.athleteId}
                    className={`flex items-center justify-between px-5 py-3.5 ${idx !== rest.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-7 text-center text-sm font-bold text-slate-500">{idx + 4}</div>
                      <div>
                        <div className="text-sm font-semibold text-white">{athlete.name}</div>
                        <div className="text-xs text-slate-500">{athlete.location}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">
                        {athlete.value.toFixed(metric.decimals)} <span className="text-xs font-medium text-slate-400">{metric.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{athlete.testDate}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-red-900/30 py-8 mt-4">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center gap-3">
          <div className="relative w-40 h-8 opacity-90">
            <Image src="/gvn-logo-letters.png" alt="GVN Performance" fill sizes="160px" className="object-contain" />
          </div>
          <p className="text-red-600 font-extrabold text-lg tracking-[0.15em] uppercase">Feed The Good Wolf</p>
        </div>
      </footer>
    </div>
  )
}
