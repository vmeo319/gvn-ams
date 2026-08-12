'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Printer } from 'lucide-react'
import MetricChartPanel from '@/app/components/MetricChartPanel'
import { Metric, MetricKey, METRIC_INFO } from '@/app/components/metricInfo'

export default function AthleteReportCardPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const athleteId = params.id

  const [authorized, setAuthorized] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [location, setLocation] = useState('')
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)

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
      setAuthorized(true)

      const { data: athlete } = await supabase
        .from('profiles')
        .select('first_name, last_name, location_id')
        .eq('id', athleteId)
        .single()
      setAthleteName(`${athlete?.first_name || ''} ${athlete?.last_name || ''}`.trim())

      if (athlete?.location_id) {
        const { data: loc } = await supabase.from('locations').select('name').eq('id', athlete.location_id).single()
        setLocation(loc?.name || '')
      }

      const { data: metricRows } = await supabase
        .from('performance_metrics')
        .select('test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches, weight_lbs')
        .eq('athlete_id', athleteId)
        .order('test_date', { ascending: true })
      setMetrics((metricRows || []) as Metric[])

      setLoading(false)
    }
    load()
  }, [athleteId, router])

  if (loading || !authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 print:p-0 print:max-w-none">
      <style>{`
        @media print {
          @page { margin: 0.4in; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between">
        <Link
          href={`/coach/athlete/${athleteId}`}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Profile</span>
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save as PDF</span>
        </button>
      </div>

      <div className="p-8 print:p-0 rounded-2xl print:rounded-none border print:border-0 border-red-900/30 bg-slate-900 print:bg-white space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 print:border-slate-300 pb-6">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <Image src="/gvn-logo-wolf.png" alt="GVN Wolf Logo" fill className="object-contain" />
            </div>
            <div className="relative w-40 h-8">
              <Image src="/gvn-logo-letters.png" alt="GVN Performance" fill className="object-contain" />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 print:text-slate-600 uppercase tracking-wider">Athlete Report Card</div>
            <div className="text-xs text-slate-600 print:text-slate-500">Generated {generatedDate}</div>
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-white print:text-slate-900 uppercase tracking-tight">{athleteName || 'Athlete'}</h1>
          {location && <div className="text-sm text-slate-500 print:text-slate-600 mt-1">{location}</div>}
        </div>

        {/* Single column for print regardless of the printing device's own screen width —
            paper is generally narrower than a desktop viewport, so keeping the 2-column
            grid for print (the md: breakpoint doesn't know it's paper, not a display) is
            what was cramming/cutting off charts. */}
        <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-1 gap-4 print:gap-6">
          {(Object.keys(METRIC_INFO) as MetricKey[]).map((key) => (
            <div key={key} className="print:break-inside-avoid">
              <MetricChartPanel metricKey={key} metrics={metrics} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
