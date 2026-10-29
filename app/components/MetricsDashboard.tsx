'use client'

import React, { useState } from 'react'
import MetricChartPanel from './MetricChartPanel'
import DateRangeFilter from './DateRangeFilter'
import { Metric, MetricKey, METRIC_INFO, formatTickDate, visibleMetricKeys } from './metricInfo'
import { RangePreset, presetRange, toISO } from '@/lib/dateRanges'

export type { Metric, MetricKey }
export { METRIC_INFO, formatTickDate }

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

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading performance profile...</div>
  }

  const range = preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset)
  const inRange = metrics.filter((m) => m.test_date >= range.start && m.test_date <= range.end)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
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
      {/* Which cards show is decided from all-time data, so an on-ice card doesn't vanish
          just because the chosen range has no on-ice tests. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visibleMetricKeys(metrics).map((key) => (
          <MetricChartPanel key={key} metricKey={key} metrics={inRange} athleteName={athleteName} />
        ))}
      </div>
    </div>
  )
}
