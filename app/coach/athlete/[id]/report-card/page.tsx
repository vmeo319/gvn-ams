'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Printer } from 'lucide-react'
import MetricChartPanel from '@/app/components/MetricChartPanel'
import { Metric, MetricKey, METRIC_INFO } from '@/app/components/metricInfo'

const ALL_METRIC_KEYS = Object.keys(METRIC_INFO) as MetricKey[]
const CHARTS_PER_PAGE = 4

export default function AthleteReportCardPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const athleteId = params.id

  const [authorized, setAuthorized] = useState(false)
  const [athleteName, setAthleteName] = useState('')
  const [location, setLocation] = useState('')
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(ALL_METRIC_KEYS)
  const [preparingPrint, setPreparingPrint] = useState(false)

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  // Recharts resizes each chart's SVG (via ResizeObserver) when the print media query
  // changes the grid to 2 columns — that resize is asynchronous, and window.print() doesn't
  // wait for it. Calling print immediately captured charts mid-resize (axis labels present,
  // but no drawn lines — a blank-looking first page followed by a correctly-rendered second
  // page once the resize caught up). Nudging a resize first and giving it a beat to settle
  // avoids that race.
  function handlePrint() {
    setPreparingPrint(true)
    window.dispatchEvent(new Event('resize'))
    setTimeout(() => {
      window.print()
      setPreparingPrint(false)
    }, 350)
  }

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
      const name = `${athlete?.first_name || ''} ${athlete?.last_name || ''}`.trim()
      setAthleteName(name)
      // Chrome's "Save as PDF" defaults the save filename to document.title — without this
      // every report card downloads as the site-wide title ("GVN Performance") regardless
      // of which athlete it's for.
      if (name) document.title = `Performance Report Card - ${name}`

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

  // Chunked into pages of 4 so a 5th (or 6th...) selected metric spills onto its own page,
  // each page repeating the branded header/athlete name, matching a real multi-page report.
  const pages: MetricKey[][] = []
  for (let i = 0; i < selectedMetrics.length; i += CHARTS_PER_PAGE) {
    pages.push(selectedMetrics.slice(i, i + CHARTS_PER_PAGE))
  }

  return (
    <div className="report-card-root p-6 max-w-5xl mx-auto space-y-6 print:p-0 print:max-w-none">
      <style>{`
        @media print {
          @page { margin: 0.4in; }
          /* !important guarantees this wins over max-w-5xl regardless of Tailwind's
             utility cascade order — printed output was rendering as a narrow, centered
             card (roughly half the page width) instead of filling the printable area,
             which points at the max-width cap surviving into print somehow. */
          .report-card-root {
            max-width: none !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
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
          onClick={handlePrint}
          disabled={preparingPrint}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          <span>{preparingPrint ? 'Preparing...' : 'Print / Save as PDF'}</span>
        </button>
      </div>

      <div className="print:hidden p-4 rounded-xl border border-slate-800 bg-slate-900 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-sm font-semibold text-slate-400">Metrics to include:</span>
        {ALL_METRIC_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedMetrics.includes(key)}
              onChange={() => toggleMetric(key)}
              className="accent-red-600 w-4 h-4"
            />
            {METRIC_INFO[key].name}
          </label>
        ))}
      </div>

      {pages.length === 0 && (
        <div className="p-8 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-900">
          Select at least one metric to include in the report.
        </div>
      )}

      {pages.map((pageKeys, pageIndex) => (
        <div
          key={pageIndex}
          className={`p-8 print:p-0 rounded-2xl print:rounded-none border print:border-0 border-red-900/30 bg-slate-900 space-y-8 ${
            pageIndex < pages.length - 1 ? 'print:break-after-page' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0">
                <Image src="/gvn-logo-wolf.png" alt="GVN Wolf Logo" fill className="object-contain" />
              </div>
              <div className="relative w-40 h-8">
                <Image src="/gvn-logo-letters.png" alt="GVN Performance" fill className="object-contain" />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Athlete Report Card</div>
              <div className="text-xs text-slate-600">Generated {generatedDate}</div>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white uppercase tracking-tight">{athleteName || 'Athlete'}</h1>
            {location && <div className="text-sm text-slate-500 mt-1">{location}</div>}
          </div>

          {/* 1 chart gets a single centered panel; 2 or 4 form a clean side-by-side grid
              (on screen and when printed — paper is roughly desktop-width in CSS pixels,
              so forcing 2 columns for print here is what actually makes charts sit "nicely
              next to each other" instead of stacking narrow on a wide sheet of paper). A
              3rd chart just falls into the same 2-column grid (2 on the first row, 1 alone
              on the second) rather than getting a special 3-up layout. */}
          <div
            className={
              pageKeys.length === 1
                ? 'max-w-xl mx-auto'
                : 'grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 print:gap-6'
            }
          >
            {pageKeys.map((key) => (
              <div key={key} className="print:break-inside-avoid">
                <MetricChartPanel metricKey={key} metrics={metrics} athleteName={athleteName} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
