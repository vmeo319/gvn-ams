'use client'

import React from 'react'
import MetricChartPanel from './MetricChartPanel'
import { Metric, MetricKey, METRIC_INFO, formatTickDate } from './metricInfo'

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
  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading performance profile...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {(Object.keys(METRIC_INFO) as MetricKey[]).map((key) => (
        <MetricChartPanel key={key} metricKey={key} metrics={metrics} athleteName={athleteName} />
      ))}
    </div>
  )
}
