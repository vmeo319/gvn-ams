'use client'

import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import MetricChartPanel from './MetricChartPanel'
import DateRangeFilter from './DateRangeFilter'
import { Metric, MetricKey, METRIC_INFO, formatTickDate, visibleMetricKeys } from './metricInfo'
import { RangePreset, presetRange, toISO } from '@/lib/dateRanges'

export type { Metric, MetricKey }
export { METRIC_INFO, formatTickDate }

// Charts shown before anything is picked; the rest are a click away in the Metrics menu.
const DEFAULT_METRICS: MetricKey[] = ['cmj', 'top_speed', 'iso']

export default function MetricsDashboard({
  metrics,
  loading,
  athleteName,
}: {
  metrics: Metric[]
  loading: boolean
  athleteName?: string
}) {
  // Defaults to all time so the charts look as they always have until a range is picked.
  const [preset, setPreset] = useState<RangePreset>('all')
  const [customStart, setCustomStart] = useState(presetRange('90d').start)
  const [customEnd, setCustomEnd] = useState(toISO(new Date()))
  const [chosen, setChosen] = useState<MetricKey[]>(DEFAULT_METRICS)
  const [menuOpen, setMenuOpen] = useState(false)

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading performance profile...</div>
  }

  const range = preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset)
  const inRange = metrics.filter((m) => m.test_date >= range.start && m.test_date <= range.end)
  // Only metrics this athlete has (decided from all-time data, so an on-ice card doesn't
  // vanish just because the chosen range has no on-ice tests), in their usual order.
  const available = visibleMetricKeys(metrics)
  const shown = available.filter((k) => chosen.includes(k))

  const toggle = (key: MetricKey) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-700 transition"
          >
            Metrics ({shown.length} of {available.length})
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
          {menuOpen && (
            <>
              {/* Click-away layer so the menu closes like a normal dropdown. */}
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-30 space-y-0.5">
                {available.map((key) => (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: METRIC_INFO[key].color }} />
                      {METRIC_INFO[key].name}
                    </span>
                    {chosen.includes(key) && <Check className="w-3.5 h-3.5 text-red-500" />}
                  </button>
                ))}
                <div className="flex justify-between border-t border-slate-800 pt-1.5 mt-1 px-1">
                  <button onClick={() => setChosen(available)} className="text-[11px] font-semibold text-slate-400 hover:text-white">
                    Show all
                  </button>
                  <button onClick={() => setChosen(DEFAULT_METRICS)} className="text-[11px] font-semibold text-slate-400 hover:text-white">
                    Reset to default
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date range</span>
        <DateRangeFilter
          preset={preset}
          onPreset={setPreset}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={setCustomStart}
          onCustomEnd={setCustomEnd}
        />
      </div>
      {shown.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 rounded-xl border border-slate-800 bg-slate-900">
          No metrics selected — pick some from the Metrics menu.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shown.map((key) => (
            <MetricChartPanel key={key} metricKey={key} metrics={inRange} athleteName={athleteName} />
          ))}
        </div>
      )}
    </div>
  )
}
