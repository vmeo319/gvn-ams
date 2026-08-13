'use client'

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bucketLogsByWeek, VolumeLog } from '@/lib/weeklyVolume'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Download } from 'lucide-react'
import { downloadSvgAsPng } from '@/lib/downloadChartPng'

const WEEKS_SHOWN = 8

function formatWeekLabel(weekStart: unknown): string {
  const str = String(weekStart ?? '')
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WeeklyVolumeChart({ athleteId, athleteName }: { athleteId: string; athleteName?: string }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ weekStart: string; totalVolume: number }[]>([])
  const chartRef = useRef<HTMLDivElement>(null)

  function handleDownload() {
    const svg = chartRef.current?.querySelector('svg')
    if (!svg) return
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-')
    const prefix = athleteName ? `Performance Report Card - ${sanitize(athleteName)}` : 'Performance Report Card'
    downloadSvgAsPng(svg, `${prefix} - Weekly Volume.png`)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: logs } = await supabase
        .from('exercise_logs')
        .select('logged_at, reps, weight_lbs')
        .eq('athlete_id', athleteId)
        .order('logged_at', { ascending: true })

      const buckets = bucketLogsByWeek((logs || []) as VolumeLog[])
      setData(buckets.slice(-WEEKS_SHOWN))
      setLoading(false)
    }
    load()
  }, [athleteId])

  return (
    <div className="p-6 rounded-xl border border-slate-800 print:border-slate-300 bg-slate-900 print:bg-white space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white print:text-slate-900">Weekly Volume</h2>
        {!loading && data.length > 0 && (
          <button
            onClick={handleDownload}
            title="Download as PNG"
            className="print:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
      {loading && <div className="text-sm text-slate-500">Loading...</div>}
      {!loading && data.length === 0 && (
        <div className="text-sm text-slate-500">No logged sets yet.</div>
      )}
      {!loading && data.length > 0 && (
        <div ref={chartRef} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="weekStart" tickFormatter={formatWeekLabel} stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={formatWeekLabel}
                formatter={(value: unknown) => [`${Number(value).toLocaleString()} lbs`, 'Total Volume']}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
              />
              <Bar dataKey="totalVolume" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
