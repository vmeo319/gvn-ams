'use client'

import React from 'react'
import { TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { computeTrend } from '@/lib/trends'

const STYLES: Record<string, { icon: React.ElementType; color: string; border: string; bg: string; label: string }> = {
  improving: { icon: TrendingUp, color: '#10b981', border: 'border-emerald-800', bg: 'bg-emerald-950/20', label: 'Improving' },
  plateauing: { icon: Minus, color: '#f59e0b', border: 'border-amber-800', bg: 'bg-amber-950/20', label: 'Plateauing' },
  declining: { icon: TrendingDown, color: '#ef4444', border: 'border-red-800', bg: 'bg-red-950/20', label: 'Declining' },
  insufficient_data: { icon: HelpCircle, color: '#64748b', border: 'border-slate-800', bg: 'bg-slate-900', label: 'Not enough data' },
}

export default function TrendBadge({
  metricName,
  metricColor,
  points,
  lowerIsBetter,
  range,
}: {
  metricName: string
  metricColor: string
  points: { date: string; value: number }[]
  // For times: a falling value is the improvement.
  lowerIsBetter?: boolean
  // Judge the trend inside this date range (e.g. a past summer) instead of the last 90 days.
  range?: { start: string; end: string }
}) {
  const trend = computeTrend(points, range)
  const classification =
    lowerIsBetter && trend.classification === 'improving'
      ? 'declining'
      : lowerIsBetter && trend.classification === 'declining'
        ? 'improving'
        : trend.classification
  const style = STYLES[classification]
  const Icon = style.icon

  const sparklineData = points
    .filter((p) =>
      range ? p.date >= range.start && p.date <= range.end : new Date(p.date).getTime() >= Date.now() - 90 * 24 * 60 * 60 * 1000
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const spanWeeks =
    sparklineData.length >= 2
      ? Math.max(1, Math.round((new Date(sparklineData[sparklineData.length - 1].date).getTime() - new Date(sparklineData[0].date).getTime()) / (7 * 24 * 60 * 60 * 1000)))
      : 0

  return (
    <div className={`p-4 rounded-xl border ${style.border} ${style.bg} flex items-center justify-between gap-3`}>
      <div>
        <div className="text-xs font-medium text-slate-400">{metricName}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <Icon className="w-4 h-4" style={{ color: style.color }} />
          <span className="text-sm font-semibold" style={{ color: style.color }}>
            {style.label}
            {trend.lowConfidence && classification !== 'insufficient_data' && (
              <span className="text-slate-500 font-normal"> (low confidence)</span>
            )}
          </span>
        </div>
        {trend.percentChange90 !== null && (
          <div className="text-xs text-slate-500 mt-0.5">
            {trend.percentChange90 >= 0 ? '+' : ''}
            {trend.percentChange90.toFixed(1)}% {range ? `over ${spanWeeks} wk` : '/ 90d'}
          </div>
        )}
      </div>
      {sparklineData.length >= 2 && (
        <div className="w-24 h-10 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line type="monotone" dataKey="value" stroke={metricColor} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
