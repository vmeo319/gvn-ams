'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ScatterChart,
  Scatter,
} from 'recharts'
import { ArrowLeft, Check, ChevronDown, TrendingUp, TrendingDown, Trophy, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import {
  METRIC_INFO,
  MetricKey,
  CMJ_DETAIL_FIELDS,
  CMJ_DETAIL_INFO,
  IMPULSE_RATIO_CUTOFFS,
  JumpStrategy,
  formatTickDate,
} from '@/app/components/metricInfo'
import {
  listGroupsWithCounts,
  getGroupsMetricsReport,
  GroupsMetricsReport,
  AthleteBest,
  AthleteChange,
  CmjPoint,
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

// GVN's summer training block: Jun 1 - Aug 14 of the current year once June has started,
// otherwise last year's.
function summerRange(): { start: string; end: string; label: string } {
  const now = new Date()
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
  return { start: `${year}-06-01`, end: `${year}-08-14`, label: `Summer ${year}` }
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

interface SectionDef {
  field: ReportMetricField
  name: string
  unit: string
  color: string
  decimals: number
  better: 'higher' | 'lower' | 'neutral'
}

const CORE_SECTIONS: SectionDef[] = (Object.keys(METRIC_INFO) as MetricKey[]).map((key) => {
  const info = METRIC_INFO[key]
  return { ...info, field: info.field as ReportMetricField, better: key === 'weight' ? 'neutral' : 'higher' }
})
const CMJ_SECTIONS: SectionDef[] = CMJ_DETAIL_FIELDS.map((field) => ({ field, ...CMJ_DETAIL_INFO[field] }))
const SECTION_BY_FIELD = new Map([...CORE_SECTIONS, ...CMJ_SECTIONS].map((d) => [d.field, d]))

// Program summary columns: the performance KPIs that have a better direction.
const SUMMARY_FIELDS: ReportMetricField[] = [
  'cmj_height_inches',
  'cmj_peak_rel_prop_power',
  'cmj_avg_rel_braking_force',
  'cmj_avg_rel_prop_force',
  'cmj_braking_phase_s',
  'cmj_propulsive_phase_s',
  'iso_belt_squat_peak_force',
  'top_speed',
]

// Diverging pair with a neutral midpoint: braking and propulsive are the two poles of the
// impulse ratio, balanced sits between.
const STRATEGY_STYLE: Record<JumpStrategy, { label: string; color: string; range: string }> = {
  braking: { label: 'Braking', color: '#d95926', range: `< ${IMPULSE_RATIO_CUTOFFS.braking}` },
  balanced: { label: 'Balanced', color: '#94a3b8', range: `${IMPULSE_RATIO_CUTOFFS.braking}–${IMPULSE_RATIO_CUTOFFS.propulsive}` },
  propulsive: { label: 'Propulsive', color: '#3987e5', range: `> ${IMPULSE_RATIO_CUTOFFS.propulsive}` },
}

const shortName = (name: string) => name.replace(/ \(.*\)$/, '')

const groupRows = (report: GroupsMetricsReport, groupColor: (groupId: string) => string | null) => [
  ...report.groups.map((g) => ({ key: g.id, label: `${g.name} · ${g.locationName.replace('GVN- ', '')}`, color: groupColor(g.id) })),
  ...(report.groups.length > 1 ? [{ key: 'all', label: 'All selected', color: null }] : []),
]

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
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
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
          <ProgramSummary report={report} groupColor={groupColor} />
          <JumpStrategySection report={report} groupColor={groupColor} />
          {CORE_SECTIONS.map((def) => (
            <MetricSection key={def.field} def={def} report={report} groupColor={groupColor} />
          ))}
          <h2 className="text-lg font-bold uppercase tracking-tight pt-2">CMJ force-plate detail</h2>
          {CMJ_SECTIONS.map((def) => (
            <MetricSection key={def.field} def={def} report={report} groupColor={groupColor} />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricSection({
  def: info,
  report,
  groupColor,
}: {
  def: SectionDef
  report: GroupsMetricsReport
  groupColor: (groupId: string) => string | null
}) {
  const field = info.field
  const data = report.series[field]
  const best = report.best[field]
  const change = report.change[field]
  const neutral = info.better === 'neutral'
  const unitSuffix = info.unit ? ` ${info.unit}` : ''
  const multi = report.groups.length > 1
  const perGroupLines = multi ? report.groups.filter((g) => groupColor(g.id)) : []

  const latestAll = [...data].reverse().find((r) => r.all !== null)?.all as number | undefined

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-medium text-slate-400">{info.name} — group weekly average</div>
          <div className="text-2xl font-bold mt-0.5 text-white">
            {latestAll !== undefined ? `${latestAll.toFixed(info.decimals)}${unitSuffix}` : '--'}
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
                  formatter={(v) => (typeof v === 'number' ? `${v.toFixed(info.decimals)}${unitSuffix}` : '--')}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                />
                {field === 'cmj_impulse_ratio' && (
                  <>
                    <ReferenceLine y={IMPULSE_RATIO_CUTOFFS.braking} stroke={STRATEGY_STYLE.braking.color} strokeDasharray="4 4" />
                    <ReferenceLine y={IMPULSE_RATIO_CUTOFFS.propulsive} stroke={STRATEGY_STYLE.propulsive.color} strokeDasharray="4 4" />
                  </>
                )}
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
            title={neutral ? `Latest ${shortName(info.name)}` : `Best ${shortName(info.name)}`}
            topLabel={neutral ? 'Highest' : 'Top 3'}
            bottomLabel={neutral ? 'Lowest' : 'Bottom 3'}
            neutral={neutral}
            rows={best}
            render={(r: AthleteBest) => `${r.value.toFixed(info.decimals)}${unitSuffix}`}
          />
          <RankingTable
            title={neutral ? '% change (first → latest)' : '% change (first → best after)'}
            topLabel={neutral ? 'Biggest increase' : 'Most improved'}
            bottomLabel={neutral ? 'Biggest decrease' : 'Most declined'}
            neutral={neutral}
            rows={change}
            render={(r: AthleteChange) => `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`}
            detail={(r: AthleteChange) =>
              `${r.first.toFixed(info.decimals)} → ${r.compare.toFixed(info.decimals)} (${formatTickDate(r.firstDate)} – ${formatTickDate(r.compareDate)})`
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

// One row per group: the median athlete's % change on each KPI over the range. Answers "which
// program moved which quality" at a glance; the per-metric sections below show the detail.
function ProgramSummary({
  report,
  groupColor,
}: {
  report: GroupsMetricsReport
  groupColor: (groupId: string) => string | null
}) {
  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-3">
      <div>
        <div className="text-sm font-medium text-slate-300">Program summary — median athlete % change</div>
        <div className="text-xs text-slate-500 mt-0.5">
          First test in range → best test after it (shortest for phase durations). Count is athletes with 2+ test days.
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="font-semibold py-2 pr-3">Group</th>
              {SUMMARY_FIELDS.map((f) => (
                <th key={f} className="font-semibold py-2 px-2 text-right whitespace-nowrap">
                  {shortName(SECTION_BY_FIELD.get(f)!.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupRows(report, groupColor).map((row) => (
              <tr key={row.key} className="border-t border-slate-800">
                <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {row.color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />}
                    {row.label}
                  </span>
                </td>
                {SUMMARY_FIELDS.map((f) => {
                  const cell = report.groupChange[f]?.[row.key]
                  if (!cell) {
                    return (
                      <td key={f} className="py-2 px-2 text-right text-slate-600">
                        --
                      </td>
                    )
                  }
                  // Arrow follows the number's sign; color says whether that's an improvement
                  // (a drop is good for phase durations).
                  const improved = SECTION_BY_FIELD.get(f)!.better === 'lower' ? cell.median < 0 : cell.median > 0
                  const flat = Math.abs(cell.median) < 0.05
                  const Icon = flat ? Minus : cell.median > 0 ? TrendingUp : TrendingDown
                  return (
                    <td key={f} className="py-2 px-2 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                          flat ? 'text-slate-400' : improved ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        {cell.median >= 0 ? '+' : ''}
                        {cell.median.toFixed(1)}%
                      </span>
                      <span className="text-slate-500 ml-1">({cell.n})</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pearson(points: { x: number; y: number }[]): number | null {
  const n = points.length
  if (n < 3) return null
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

function strengthLabel(r: number): string {
  const a = Math.abs(r)
  if (a < 0.2) return 'no clear relationship'
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : 'weak'
  return `${strength} ${r > 0 ? 'positive' : 'negative'} relationship`
}

const JUMP_STRATEGIES: JumpStrategy[] = ['braking', 'balanced', 'propulsive']

const FORCE_VS_RATIO: { title: string; unit: string; decimals: number; y: (p: CmjPoint) => number | null }[] = [
  { title: 'Avg Rel. Braking Force', unit: '% BW', decimals: 1, y: (p) => p.brakingForce },
  { title: 'Avg Rel. Propulsive Force', unit: '% BW', decimals: 1, y: (p) => p.propForce },
  {
    title: 'Propulsive ÷ Braking Force',
    unit: '',
    decimals: 2,
    y: (p) => (p.brakingForce && p.propForce ? p.propForce / p.brakingForce : null),
  },
]

// How closely the average braking/propulsive forces line up with the impulse ratio athletes are
// categorized by, plus how many athletes in each group moved between strategies over the range.
function JumpStrategySection({
  report,
  groupColor,
}: {
  report: GroupsMetricsReport
  groupColor: (groupId: string) => string | null
}) {
  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-300">Jump strategy — impulse ratio vs. CMJ forces</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Each dot is one athlete&apos;s best CMJ on a test day ({report.cmjPoints.length} jumps). Dashed lines are the
          strategy cutoffs: braking {STRATEGY_STYLE.braking.range}, balanced {STRATEGY_STYLE.balanced.range}, propulsive{' '}
          {STRATEGY_STYLE.propulsive.range}. r is the correlation (±1 = moves together perfectly, 0 = unrelated).
        </div>
      </div>

      {report.cmjPoints.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">No impulse ratio data in this range.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {FORCE_VS_RATIO.map((c) => {
            const pts = report.cmjPoints
              .map((p) => ({ x: p.impulseRatio, y: c.y(p), name: p.name, date: p.date }))
              .filter((p): p is { x: number; y: number; name: string; date: string } => p.y !== null)
            const r = pearson(pts)
            return (
              <div key={c.title} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-xs font-semibold text-slate-300">
                  {c.title}
                  {c.unit ? ` (${c.unit})` : ''}
                </div>
                <div className="text-[11px] text-slate-400 mb-2">
                  {r === null ? 'Not enough data' : `r = ${r.toFixed(2)} · ${strengthLabel(r)}`}
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={['auto', 'auto']}
                        stroke="#94a3b8"
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Impulse ratio', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 10 }}
                      />
                      <YAxis type="number" dataKey="y" domain={['auto', 'auto']} stroke="#94a3b8" tick={{ fontSize: 10 }} width={44} />
                      <ReferenceLine x={IMPULSE_RATIO_CUTOFFS.braking} stroke={STRATEGY_STYLE.braking.color} strokeDasharray="4 4" />
                      <ReferenceLine x={IMPULSE_RATIO_CUTOFFS.propulsive} stroke={STRATEGY_STYLE.propulsive.color} strokeDasharray="4 4" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          const p = active ? payload?.[0]?.payload : null
                          if (!p) return null
                          return (
                            <div className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200">
                              <div className="font-semibold">{p.name}</div>
                              <div className="text-slate-400">{formatTickDate(p.date)}</div>
                              <div>Impulse ratio {p.x.toFixed(2)}</div>
                              <div>
                                {c.title} {p.y.toFixed(c.decimals)}
                                {c.unit ? ` ${c.unit}` : ''}
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Scatter data={pts} fill="#3987e5" fillOpacity={0.5} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="text-xs font-semibold text-slate-300 mb-1">Athletes per strategy — first CMJ in range → latest</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left">
              <th className="font-semibold py-2 pr-3">Group</th>
              {JUMP_STRATEGIES.map((s) => (
                <th key={s} className="font-semibold py-2 px-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STRATEGY_STYLE[s].color }} />
                    {STRATEGY_STYLE[s].label} ({STRATEGY_STYLE[s].range})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupRows(report, groupColor).map((row) => {
              const entry = report.strategy[row.key]
              return (
                <tr key={row.key} className="border-t border-slate-800">
                  <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {row.color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />}
                      {row.label}
                    </span>
                  </td>
                  {JUMP_STRATEGIES.map((s) => (
                    <td key={s} className="py-2 px-2 text-right tabular-nums text-slate-300">
                      {entry ? (
                        <>
                          {entry.first[s]} → <span className="font-semibold text-white">{entry.latest[s]}</span>
                        </>
                      ) : (
                        '--'
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
