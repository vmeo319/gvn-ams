'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { ArrowLeft, Check, ChevronDown, TrendingUp, TrendingDown, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { METRIC_INFO, MetricKey, formatTickDate } from '@/app/components/metricInfo'
import {
  listGroupsWithCounts,
  getGroupsMetricsReport,
  GroupsMetricsReport,
  AthleteBest,
  AthleteChange,
  ReportMetricField,
} from '../actions'

interface GroupOption {
  id: string
  name: string
  locationName: string
}

// Fixed categorical order for per-group lines, validated (colorblind separation + contrast)
// against the app's #0f172a chart surface. Colors follow the group's position in the
// selection, capped at 8 -- past that the chart shows only the combined average.
const GROUP_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

type RangePreset = '30d' | '90d' | '6m' | '12m' | 'summer' | 'all' | 'custom'

const toISO = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// "This summer" = Jun 1 - Aug 31 of the current year once June has started, otherwise last year's.
function summerRange(): { start: string; end: string; label: string } {
  const now = new Date()
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
  return { start: `${year}-06-01`, end: `${year}-08-31`, label: `Summer ${year}` }
}

function presetRange(preset: RangePreset): { start: string; end: string } {
  const today = new Date()
  const back = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return toISO(d)
  }
  switch (preset) {
    case '30d': return { start: back(30), end: toISO(today) }
    case '90d': return { start: back(90), end: toISO(today) }
    case '6m': return { start: back(182), end: toISO(today) }
    case '12m': return { start: back(365), end: toISO(today) }
    case 'summer': return summerRange()
    case 'all': return { start: '2000-01-01', end: toISO(today) }
    default: return { start: back(90), end: toISO(today) }
  }
}

const METRIC_KEYS = Object.keys(METRIC_INFO) as MetricKey[]

export default function GroupMetricsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading...</div>}>
      <GroupMetricsReport />
    </Suspense>
  )
}

function GroupMetricsReport() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedIds = useMemo(
    () => (searchParams.get('ids') || '').split(',').filter(Boolean),
    [searchParams]
  )

  const [authorized, setAuthorized] = useState(false)
  const [allGroups, setAllGroups] = useState<GroupOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [preset, setPreset] = useState<RangePreset>('90d')
  const [customStart, setCustomStart] = useState(presetRange('90d').start)
  const [customEnd, setCustomEnd] = useState(toISO(new Date()))
  const [report, setReport] = useState<GroupsMetricsReport | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')

  const range = preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset)

  useEffect(() => {
    async function init() {
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
      const res = await listGroupsWithCounts()
      if (res.success) setAllGroups(res.results.map((g) => ({ id: g.id, name: g.name, locationName: g.locationName })))
    }
    init()
  }, [router])

  // Loading is derived (requested inputs vs. the inputs of the last response) rather than
  // toggled, and a response for superseded inputs is dropped, so quick filter changes can't
  // paint an older report over a newer one.
  const idsKey = selectedIds.join(',')
  const requestKey = `${idsKey}|${range.start}|${range.end}`
  const loading = idsKey !== '' && loadedKey !== requestKey

  useEffect(() => {
    if (!authorized || !idsKey || !range.start || !range.end) return
    let cancelled = false
    getGroupsMetricsReport({ groupIds: idsKey.split(','), startISO: range.start, endISO: range.end }).then((res) => {
      if (cancelled) return
      setLoadedKey(requestKey)
      if (res.success && res.report) {
        setReport(res.report)
        setError('')
      } else {
        setError(res.error || 'Failed to load group metrics.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [authorized, idsKey, range.start, range.end, requestKey])

  // Selection lives in the URL so the page can be bookmarked/shared and survives a refresh.
  function toggleGroup(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((g) => g !== id) : [...selectedIds, id]
    router.replace(`/coach/groups/metrics${next.length ? `?ids=${next.join(',')}` : ''}`)
  }

  if (!authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  const groupColor = (groupId: string) => {
    const idx = (report?.groups || []).findIndex((g) => g.id === groupId)
    return idx >= 0 && idx < GROUP_COLORS.length ? GROUP_COLORS[idx] : null
  }

  const presets: { key: RangePreset; label: string }[] = [
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'summer', label: summerRange().label },
    { key: '6m', label: '6 months' },
    { key: '12m', label: '12 months' },
    { key: 'all', label: 'All time' },
    { key: 'custom', label: 'Custom' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight uppercase">Group Metrics</h1>
          {report && (
            <p className="text-sm text-slate-400 mt-1">
              {report.athleteCount} athlete{report.athleteCount === 1 ? '' : 's'} across {report.groups.length} group
              {report.groups.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <Link
          href="/coach"
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 hover:border-slate-700 transition"
          >
            <span className="font-medium">
              {selectedIds.length === 0 ? 'Select groups' : `${selectedIds.length} group(s) selected`}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>
          {pickerOpen && (
            <div className="absolute left-0 mt-2 w-72 max-h-80 overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-30 space-y-0.5">
              {allGroups.map((g) => {
                const checked = selectedIds.includes(g.id)
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
                  >
                    <span>
                      {g.name}
                      <span className="text-slate-500 font-normal"> · {g.locationName}</span>
                    </span>
                    {checked && <Check className="w-4 h-4 text-red-500" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                preset === p.key ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white [color-scheme:dark]"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white [color-scheme:dark]"
            />
          </div>
        )}
      </div>

      {report && report.groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {report.groups.map((g) => {
            const color = groupColor(g.id)
            return (
              <span
                key={g.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-300"
              >
                {color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />}
                {g.name} · {g.locationName}
                <span className="text-slate-500">({g.memberCount})</span>
              </span>
            )
          })}
        </div>
      )}

      {error && <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>}

      {selectedIds.length === 0 && (
        <div className="p-8 text-center text-slate-400 rounded-xl border border-slate-800 bg-slate-900">
          Select one or more groups to see their metrics.
        </div>
      )}

      {selectedIds.length > 0 && loading && !report && (
        <div className="p-8 text-center text-slate-400">Loading group metrics...</div>
      )}

      {report && selectedIds.length > 0 && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {METRIC_KEYS.map((key) => (
            <MetricSection key={key} metricKey={key} report={report} groupColor={groupColor} />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricSection({
  metricKey,
  report,
  groupColor,
}: {
  metricKey: MetricKey
  report: GroupsMetricsReport
  groupColor: (groupId: string) => string | null
}) {
  const info = METRIC_INFO[metricKey]
  const field = info.field as ReportMetricField
  const data = report.series[field]
  const best = report.best[field]
  const change = report.change[field]
  const isWeight = metricKey === 'weight'
  const multi = report.groups.length > 1
  const perGroupLines = multi ? report.groups.filter((g) => groupColor(g.id)) : []

  const latestAll = [...data].reverse().find((r) => r.all !== null)?.all as number | undefined

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-medium text-slate-400">{info.name} — group weekly average</div>
          <div className="text-2xl font-bold mt-0.5 text-white">
            {latestAll !== undefined ? `${latestAll.toFixed(info.decimals)} ${info.unit}` : '--'}
            <span className="text-xs font-normal text-slate-500 ml-2">latest week</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 h-72 w-full overflow-hidden">
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              No {info.name.toLowerCase()} data in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 15, bottom: 30, left: 5 }}>
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
                <YAxis stroke="#94a3b8" domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={46} />
                <Tooltip
                  labelFormatter={(l) => `Week of ${formatTickDate(l)}`}
                  formatter={(v) => (typeof v === 'number' ? `${v.toFixed(info.decimals)} ${info.unit}` : '--')}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                />
                {perGroupLines.length > 0 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {perGroupLines.length > 0 ? (
                  <>
                    {perGroupLines.map((g) => (
                      <Line
                        key={g.id}
                        type="monotone"
                        dataKey={g.id}
                        name={`${g.name} · ${g.locationName.replace('GVN- ', '')}`}
                        stroke={groupColor(g.id)!}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="all"
                      name="All selected"
                      stroke="#e2e8f0"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                    />
                  </>
                ) : (
                  <Line
                    type="monotone"
                    dataKey="all"
                    name={multi ? 'All selected' : info.name}
                    stroke={info.color}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
          <RankingTable
            title={isWeight ? 'Current weight' : `Best ${info.name.replace(/ \(.*\)$/, '')}`}
            topLabel={isWeight ? 'Heaviest' : 'Top 3'}
            bottomLabel={isWeight ? 'Lightest' : 'Bottom 3'}
            neutral={isWeight}
            rows={best}
            render={(r: AthleteBest) => `${r.value.toFixed(info.decimals)} ${info.unit}`}
          />
          <RankingTable
            title="% change over range"
            topLabel={isWeight ? 'Biggest gain' : 'Most improved'}
            bottomLabel={isWeight ? 'Biggest loss' : 'Most declined'}
            neutral={isWeight}
            rows={change}
            render={(r: AthleteChange) => `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}
            detail={(r: AthleteChange) =>
              `${r.first.toFixed(info.decimals)} → ${r.last.toFixed(info.decimals)} (${formatTickDate(r.firstDate)} – ${formatTickDate(r.lastDate)})`
            }
            emptyNote="Needs 2+ test days in range"
          />
        </div>
      </div>
    </div>
  )
}

// Top 3 from the head of an already-sorted list, bottom 3 from its tail -- never overlapping,
// so with fewer than 6 athletes the bottom list just gets shorter.
function RankingTable<T extends { athleteId: string; name: string }>({
  title,
  topLabel,
  bottomLabel,
  rows,
  render,
  detail,
  neutral,
  emptyNote,
}: {
  title: string
  topLabel: string
  bottomLabel: string
  rows: T[]
  render: (r: T) => string
  detail?: (r: T) => string
  neutral?: boolean
  emptyNote?: string
}) {
  const top = rows.slice(0, 3)
  const bottom = rows.slice(Math.max(3, rows.length - 3)).reverse()

  const renderRow = (r: T, i: number) => (
    <li key={r.athleteId} className="flex items-baseline justify-between gap-2 py-1">
      <div className="min-w-0">
        <Link href={`/coach/athlete/${r.athleteId}`} className="text-slate-200 hover:underline truncate block">
          <span className="text-slate-500 mr-1.5">{i + 1}.</span>
          {r.name}
        </Link>
        {detail && <div className="text-[10px] text-slate-500 truncate">{detail(r)}</div>}
      </div>
      <span className="font-semibold text-white tabular-nums shrink-0">{render(r)}</span>
    </li>
  )

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
      <div className="font-semibold text-slate-300 mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-slate-500">{emptyNote || 'No data in this range.'}</div>
      ) : (
        <div className="space-y-2">
          <div>
            <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${neutral ? 'text-slate-400' : 'text-emerald-400'}`}>
              {neutral ? <Trophy className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {topLabel}
            </div>
            <ol>{top.map(renderRow)}</ol>
          </div>
          {bottom.length > 0 && (
            <div className="border-t border-slate-800 pt-2">
              <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${neutral ? 'text-slate-400' : 'text-red-400'}`}>
                {neutral ? <Trophy className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {bottomLabel}
              </div>
              <ol>{bottom.map(renderRow)}</ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
