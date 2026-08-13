'use client'

import React, { useMemo, useRef } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Download } from 'lucide-react'
import { Metric, MetricKey, METRIC_INFO, formatTickDate } from './metricInfo'
import { downloadSvgAsPng } from '@/lib/downloadChartPng'

function latestValue(metrics: Metric[], field: keyof Metric): number {
  const withValue = metrics.filter((m) => m[field] !== null && m[field] !== undefined)
  if (withValue.length === 0) return 0
  const latest = withValue.reduce((a, b) => (a.test_date > b.test_date ? a : b))
  return latest[field] as number
}

export default function MetricChartPanel({
  metricKey,
  metrics,
  athleteName,
}: {
  metricKey: MetricKey
  metrics: Metric[]
  athleteName?: string
}) {
  const info = METRIC_INFO[metricKey]
  const chartRef = useRef<HTMLDivElement>(null)

  const chartData = useMemo(() => {
    return metrics
      .filter((m) => m[info.field] !== null && m[info.field] !== undefined)
      .map((m) => ({ test_date: m.test_date, value: m[info.field] as number }))
  }, [metrics, info.field])

  const summaryValue =
    info.summaryMode === 'latest'
      ? latestValue(metrics, info.field)
      : metrics.length
        ? Math.max(...metrics.map((m) => (m[info.field] as number) || 0))
        : 0

  function handleDownload() {
    const svg = chartRef.current?.querySelector('svg')
    if (!svg) return
    // Metric names like "ISO Force (N/kg)" contain a slash, which isn't a valid filename
    // character on most OSes — sanitize just that, keep the rest human-readable.
    const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-')
    const prefix = athleteName ? `Performance Report Card - ${sanitize(athleteName)}` : 'Performance Report Card'
    downloadSvgAsPng(svg, `${prefix} - ${sanitize(info.name)}.png`)
  }

  return (
    <div className="p-5 rounded-xl border border-slate-800 print:border-slate-300 bg-slate-900 print:bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-400 print:text-slate-600">{info.name}</div>
          <div className="text-2xl font-bold mt-0.5" style={{ color: info.color }}>
            {summaryValue > 0 ? `${summaryValue.toFixed(info.decimals)} ${info.unit}` : '--'}
          </div>
        </div>
        <button
          onClick={handleDownload}
          title="Download as PNG"
          className="print:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
      <div ref={chartRef} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 15, bottom: 30, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="test_date"
              stroke="#94a3b8"
              tickFormatter={formatTickDate}
              angle={-40}
              textAnchor="end"
              height={45}
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis stroke="#94a3b8" domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={35} />
            <Tooltip
              labelFormatter={formatTickDate}
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={info.name}
              stroke={info.color}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
