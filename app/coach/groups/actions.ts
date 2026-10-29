'use server'

import { createClient } from '@supabase/supabase-js'
import { CMJ_DETAIL_FIELDS, JumpStrategy, jumpStrategy, METRIC_COLUMNS } from '@/app/components/metricInfo'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

const formatError = (err: any) => {
  if (!err) return 'Unknown error.'
  if (typeof err === 'string') return err
  if (err.message && err.message !== '{}') return err.message
  try {
    const str = JSON.stringify(err)
    if (str !== '{}') return str
  } catch (e) {}
  return 'Something went wrong.'
}

export interface GroupRow {
  id: string
  name: string
  locationId: string
  locationName: string
  birthYear: number | null
}

const GROUP_SELECT = 'id, name, location_id, birth_year, locations(name)'

function toGroupRow(g: any): GroupRow {
  return {
    id: g.id,
    name: g.name,
    locationId: g.location_id,
    locationName: g.locations?.name || '',
    birthYear: g.birth_year ?? null,
  }
}

// Location first, then that location's birth-year groups oldest to youngest, then the
// coach-made groups by name.
function compareGroups(a: GroupRow, b: GroupRow) {
  if (a.locationName !== b.locationName) return a.locationName.localeCompare(b.locationName)
  if ((a.birthYear === null) !== (b.birthYear === null)) return a.birthYear === null ? 1 : -1
  if (a.birthYear !== null && b.birthYear !== null) return a.birthYear - b.birthYear
  return a.name.localeCompare(b.name)
}

export async function listGroupsWithCounts() {
  try {
    const { data: groups, error } = await supabaseAdmin.from('groups').select(GROUP_SELECT)
    if (error) return { success: false, error: formatError(error), results: [] }

    const { data: memberships } = await supabaseAdmin.from('athlete_groups').select('group_id')
    const counts = new Map<string, number>()
    for (const m of memberships || []) counts.set(m.group_id, (counts.get(m.group_id) || 0) + 1)

    return {
      success: true,
      results: (groups || [])
        .map(toGroupRow)
        .sort(compareGroups)
        .map((g) => ({ ...g, athleteCount: counts.get(g.id) || 0 })),
    }
  } catch (err: any) {
    return { success: false, error: formatError(err), results: [] }
  }
}

// Location names by id. Looked up separately rather than embedded with locations(name):
// profiles reach locations both directly and through athlete_locations, which PostgREST
// refuses to embed as ambiguous.
async function locationNames(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from('locations').select('id, name')
  return new Map((data || []).map((l) => [l.id, l.name]))
}

// Athletes for the Group Metrics athlete picker, by name.
export async function listAthletesForCompare() {
  const [{ data, error }, locs] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, first_name, last_name, location_id').eq('role', 'athlete').order('first_name'),
    locationNames(),
  ])
  if (error) return { success: false, error: formatError(error), results: [] }
  return {
    success: true,
    results: (data || []).map((p) => ({
      id: p.id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      locationName: locs.get(p.location_id) || '',
    })),
  }
}

// Every location each athlete trains at: their primary profiles.location_id plus any extras
// in athlete_locations -- the same set the DB uses to decide which groups they may join.
export async function listAllAthleteLocations() {
  const [{ data: profiles, error }, { data: extras }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, location_id').not('location_id', 'is', null),
    supabaseAdmin.from('athlete_locations').select('profile_id, location_id'),
  ])
  if (error) return { success: false, error: formatError(error), results: {} as Record<string, string[]> }
  const map: Record<string, string[]> = {}
  const add = (id: string, loc: string) => {
    map[id] = map[id] || []
    if (!map[id].includes(loc)) map[id].push(loc)
  }
  for (const p of profiles || []) add(p.id, p.location_id)
  for (const e of extras || []) add(e.profile_id, e.location_id)
  return { success: true, results: map }
}

// Select-then-insert (not upsert(onConflict)) — same reasoning as exercise_library's
// createLibraryExercise: the unique index is a lower(trim(name)) expression, which
// PostgREST's onConflict can't target with plain column syntax. Names are unique per
// location, so the same name can exist at two different locations.
export async function createGroupAction(data: { name: string; locationId: string }) {
  try {
    const name = data.name.trim()
    if (!name) return { success: false, error: 'Group name is required.' }
    if (!data.locationId) return { success: false, error: 'Pick a location for the group.' }

    const findExisting = () =>
      supabaseAdmin
        .from('groups')
        .select(GROUP_SELECT)
        .eq('location_id', data.locationId)
        .ilike('name', name)
        .maybeSingle()

    const { data: existing } = await findExisting()
    if (existing) return { success: true, group: toGroupRow(existing) }

    const { data: inserted, error } = await supabaseAdmin
      .from('groups')
      .insert({ name, location_id: data.locationId })
      .select(GROUP_SELECT)
      .single()
    if (error) {
      const { data: raceWinner } = await findExisting()
      if (raceWinner) return { success: true, group: toGroupRow(raceWinner) }
      return { success: false, error: formatError(error) }
    }
    return { success: true, group: toGroupRow(inserted) }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function renameGroupAction(data: { groupId: string; name: string }) {
  const name = data.name.trim()
  if (!name) return { success: false, error: 'Group name is required.' }
  const { error } = await supabaseAdmin.from('groups').update({ name }).eq('id', data.groupId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

export async function deleteGroupAction(data: { groupId: string }) {
  const { error } = await supabaseAdmin.from('groups').delete().eq('id', data.groupId)
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

// Replaces the full set of groups an athlete belongs to — any coach can call this (unlike
// admin's location editing), matching the ask that group membership is open to every coach.
// A trigger on athlete_groups rejects any group outside the athlete's locations.
export async function updateAthleteGroupsAction(data: { athleteId: string; groupIds: string[] }) {
  try {
    // Diff rather than delete-all-then-insert, so a rejected add can't leave the athlete
    // stripped of groups they already had.
    const { data: currentRows, error: readErr } = await supabaseAdmin
      .from('athlete_groups')
      .select('group_id')
      .eq('athlete_id', data.athleteId)
    if (readErr) return { success: false, error: formatError(readErr) }
    const current = new Set((currentRows || []).map((r) => r.group_id))
    const toAdd = data.groupIds.filter((id) => !current.has(id))
    const toRemove = [...current].filter((id) => !data.groupIds.includes(id))

    if (toAdd.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('athlete_groups')
        .insert(toAdd.map((groupId) => ({ athlete_id: data.athleteId, group_id: groupId })))
      if (insertErr) return { success: false, error: formatError(insertErr) }
    }
    if (toRemove.length > 0) {
      const { error: deleteErr } = await supabaseAdmin
        .from('athlete_groups')
        .delete()
        .eq('athlete_id', data.athleteId)
        .in('group_id', toRemove)
      if (deleteErr) return { success: false, error: formatError(deleteErr) }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// (athlete_id -> group_id[]) for every athlete at once — used by the coach dashboard to
// render each row's group badges/editor and to power the group filter.
export async function listAllAthleteGroups() {
  const { data, error } = await supabaseAdmin.from('athlete_groups').select('athlete_id, group_id')
  if (error) return { success: false, error: formatError(error), results: [] }
  return { success: true, results: data || [] }
}

export async function getGroupDetail(data: { groupId: string }) {
  try {
    const { data: groupRow, error: groupErr } = await supabaseAdmin
      .from('groups')
      .select(GROUP_SELECT)
      .eq('id', data.groupId)
      .single()
    if (groupErr || !groupRow) return { success: false, error: 'Group not found.' }
    const group = toGroupRow(groupRow)

    const { data: memberRows } = await supabaseAdmin
      .from('athlete_groups')
      .select('athlete_id')
      .eq('group_id', data.groupId)

    const athleteIds = (memberRows || []).map((r) => r.athlete_id)
    if (athleteIds.length === 0) return { success: true, group, members: [] }

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', athleteIds)

    const members = (profiles || [])
      .map((p) => ({ id: p.id, firstName: p.first_name || '', lastName: p.last_name || '' }))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))

    return { success: true, group, members }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// One week (7 consecutive dates starting weekStartISO) of attendance for every member of the
// group. Attendance lives in athlete_attendance (one row per athlete per day, not per group --
// see the 20260824000000 migration), so this reads that table filtered to the group's current
// members. Sparse: only marked days have a row, the client fills in the unmarked gaps.
export async function getWeekAttendance(data: { groupId: string; weekStartISO: string }) {
  const { data: memberRows } = await supabaseAdmin
    .from('athlete_groups')
    .select('athlete_id')
    .eq('group_id', data.groupId)
  const athleteIds = (memberRows || []).map((r) => r.athlete_id)
  if (athleteIds.length === 0) return { success: true, results: [] }

  const start = new Date(data.weekStartISO + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const endISO = end.toISOString().split('T')[0]

  const { data: rows, error } = await supabaseAdmin
    .from('athlete_attendance')
    .select('athlete_id, attendance_date, present')
    .in('athlete_id', athleteIds)
    .gte('attendance_date', data.weekStartISO)
    .lte('attendance_date', endISO)

  if (error) return { success: false, error: formatError(error), results: [] }
  return { success: true, results: rows || [] }
}

// Attendance is binary and lives at the athlete level, not per group -- one row per
// (athlete, date), no group_id at all. That's what makes cross-group consistency automatic
// instead of something app code has to cascade by hand: marking someone present from a group's
// weekly grid or from their own coach-view calendar both write the same row, so there's only
// ever one to keep track of. It's also what lets an athlete in zero groups still have
// attendance taken directly from their profile.
export async function setAttendanceAction(data: {
  athleteId: string
  date: string
  present: boolean
  markedBy: string
}) {
  if (data.present) {
    const { error } = await supabaseAdmin.from('athlete_attendance').upsert(
      {
        athlete_id: data.athleteId,
        attendance_date: data.date,
        present: true,
        marked_by: data.markedBy,
        marked_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id, attendance_date' }
    )
    if (error) return { success: false, error: formatError(error) }
  } else {
    const { error } = await supabaseAdmin
      .from('athlete_attendance')
      .delete()
      .eq('athlete_id', data.athleteId)
      .eq('attendance_date', data.date)
    if (error) return { success: false, error: formatError(error) }
  }

  return { success: true }
}

// Weekly-averaged performance metrics across every athlete in the group, shaped exactly like
// an individual athlete's Metric[] (test_date + the same four fields) so the group detail page
// can reuse MetricsDashboard/TrendBadge/pointsFor unchanged instead of a parallel group version.
// Bucketed by week (not raw test_date) because individual test dates rarely line up across
// athletes -- a per-date average would mostly be an average of one person.
function mondayOfUTC(dateISO: string): string {
  const d = new Date(dateISO + 'T00:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

const GROUP_METRIC_FIELDS = [
  'iso_belt_squat_peak_force',
  'top_speed',
  'cmj_height_inches',
  'weight_lbs',
  'on_ice_top_speed',
  'on_ice_accel_max',
  'on_ice_15yd_time',
] as const

export async function getGroupMetrics(data: { groupId: string }) {
  try {
    const { data: memberRows } = await supabaseAdmin
      .from('athlete_groups')
      .select('athlete_id')
      .eq('group_id', data.groupId)
    const athleteIds = (memberRows || []).map((r) => r.athlete_id)
    if (athleteIds.length === 0) return { success: true, results: [] }

    const { data: rows, error } = await supabaseAdmin
      .from('performance_metrics')
      .select(METRIC_COLUMNS)
      .in('athlete_id', athleteIds)
      .order('test_date', { ascending: true })
    if (error) return { success: false, error: formatError(error), results: [] }

    type Bucket = { sums: Record<string, number>; counts: Record<string, number> }
    const buckets = new Map<string, Bucket>()

    for (const row of rows || []) {
      const week = mondayOfUTC(row.test_date)
      if (!buckets.has(week)) {
        const zeroed = Object.fromEntries(GROUP_METRIC_FIELDS.map((f) => [f, 0]))
        buckets.set(week, { sums: { ...zeroed }, counts: { ...zeroed } })
      }
      const bucket = buckets.get(week)!
      for (const field of GROUP_METRIC_FIELDS) {
        const v = (row as any)[field]
        if (v !== null && v !== undefined) {
          bucket.sums[field] += v
          bucket.counts[field] += 1
        }
      }
    }

    const results = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, bucket]) => {
        const out: any = { test_date: week }
        for (const field of GROUP_METRIC_FIELDS) {
          out[field] = bucket.counts[field] > 0 ? bucket.sums[field] / bucket.counts[field] : null
        }
        return out
      })

    return { success: true, results }
  } catch (err: any) {
    return { success: false, error: formatError(err), results: [] }
  }
}

// Dates an athlete was marked present -- the billing-facing "days attended" figure, and also
// what feeds the calendar on their coach-view profile.
export async function getAthleteAttendedDates(data: { athleteId: string; sinceISO?: string }) {
  try {
    let query = supabaseAdmin
      .from('athlete_attendance')
      .select('attendance_date')
      .eq('athlete_id', data.athleteId)
      .eq('present', true)
    if (data.sinceISO) query = query.gte('attendance_date', data.sinceISO)

    const { data: rows, error } = await query
    if (error) return { success: false, error: formatError(error), dates: [] }

    const dates = (rows || []).map((r) => r.attendance_date).sort()
    return { success: true, dates }
  } catch (err: any) {
    return { success: false, error: formatError(err), dates: [] }
  }
}

// ---- Multi-group metrics report ----------------------------------------------------------
// Powers /coach/groups/metrics: weekly group-average series for each selected group (and the
// combined selection), plus per-athlete best values and % change across the chosen range, from
// which the page picks its top/bottom 3.

// The report also covers the CMJ force-plate detail (braking/propulsive forces, phases, impulse
// ratio) so program tracks can be compared on how athletes jump, not just how high.
const REPORT_METRIC_FIELDS = [...GROUP_METRIC_FIELDS, ...CMJ_DETAIL_FIELDS] as const

export type ReportMetricField = (typeof REPORT_METRIC_FIELDS)[number]

export interface AthleteBest {
  athleteId: string
  name: string
  value: number
}

export interface AthleteChange {
  athleteId: string
  name: string
  first: number
  // Best reading after the first (most recent for weight).
  compare: number
  firstDate: string
  compareDate: string
  pct: number
}

export interface GroupsMetricsReport {
  groups: { id: string; name: string; locationName: string; memberCount: number }[]
  athleteCount: number
  // One row per week: test_date (the week's Monday), `all` (every selected athlete), and one
  // key per group id.
  series: Record<ReportMetricField, Record<string, number | string | null>[]>
  best: Record<ReportMetricField, AthleteBest[]>
  change: Record<ReportMetricField, AthleteChange[]>
  // Median athlete % change per metric, for each group id and `all` -- the program summary grid.
  groupChange: Record<ReportMetricField, Record<string, { median: number; n: number } | null>>
  // Every CMJ in range that has an impulse ratio, for comparing it against the force metrics.
  cmjPoints: CmjPoint[]
  // Athletes per jump strategy at their first and latest CMJ in range, for each group id and `all`.
  strategy: Record<string, { first: StrategyCounts; latest: StrategyCounts }>
}

export interface CmjPoint {
  athleteId: string
  name: string
  date: string
  impulseRatio: number
  brakingForce: number | null
  propForce: number | null
}

export type StrategyCounts = Record<JumpStrategy, number>

// Weight has no "best" -- the most recent reading in range is what counts. Phase durations are
// better when shorter. Impulse ratio describes a jump strategy rather than better/worse, so it
// is tracked like weight.
const BEST_MODE: Record<ReportMetricField, 'max' | 'min' | 'latest'> = {
  iso_belt_squat_peak_force: 'max',
  top_speed: 'max',
  cmj_height_inches: 'max',
  weight_lbs: 'latest',
  on_ice_top_speed: 'max',
  on_ice_accel_max: 'max',
  on_ice_15yd_time: 'min',
  cmj_peak_rel_prop_power: 'max',
  cmj_avg_rel_braking_force: 'max',
  cmj_avg_rel_prop_force: 'max',
  cmj_impulse_ratio: 'latest',
  cmj_braking_phase_s: 'min',
  cmj_propulsive_phase_s: 'min',
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// birthYearMin/Max (inclusive, either optional) narrow the report to athletes born in that range,
// e.g. one level's results within an age band. Athletes with no birth year drop out when set.
export async function getGroupsMetricsReport(data: {
  groupIds: string[]
  startISO: string
  endISO: string
  birthYearMin?: number | null
  birthYearMax?: number | null
  athleteIds?: string[]
}) {
  try {
    if (data.groupIds.length === 0 && !data.athleteIds?.length) {
      return { success: false, error: 'Select at least one group or athlete.' }
    }

    const { data: groupRows, error: groupErr } = await supabaseAdmin
      .from('groups')
      .select(GROUP_SELECT)
      .in('id', data.groupIds)
    if (groupErr) return { success: false, error: formatError(groupErr) }
    const groups = (groupRows || []).map(toGroupRow).sort(compareGroups)

    const { data: groupMembers, error: memberErr } = await supabaseAdmin
      .from('athlete_groups')
      .select('athlete_id, group_id')
      .in('group_id', data.groupIds)
    if (memberErr) return { success: false, error: formatError(memberErr) }
    const memberRows = [...(groupMembers || [])]

    // Each hand-picked athlete becomes a one-person "group" (id `athlete:<id>`), so every
    // section of the report compares them exactly the way it compares groups.
    const pickedIds = data.athleteIds || []
    if (pickedIds.length > 0) {
      const [{ data: picked, error: pickErr }, locs] = await Promise.all([
        supabaseAdmin.from('profiles').select('id, first_name, last_name, location_id').in('id', pickedIds),
        locationNames(),
      ])
      if (pickErr) return { success: false, error: formatError(pickErr) }
      for (const p of (picked || []).sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))) {
        const id = `athlete:${p.id}`
        groups.push({
          id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          locationId: p.location_id,
          locationName: locs.get(p.location_id) || '',
          birthYear: null,
        })
        memberRows.push({ athlete_id: p.id, group_id: id })
      }
    }

    const groupsByAthlete = new Map<string, string[]>()
    for (const r of memberRows || []) {
      if (!groupsByAthlete.has(r.athlete_id)) groupsByAthlete.set(r.athlete_id, [])
      groupsByAthlete.get(r.athlete_id)!.push(r.group_id)
    }
    const athleteIds = [...groupsByAthlete.keys()]
    const filterByAge = data.birthYearMin != null || data.birthYearMax != null
    const inAgeRange = (birthYear: number | null) =>
      !filterByAge ||
      (birthYear != null &&
        (data.birthYearMin == null || birthYear >= data.birthYearMin) &&
        (data.birthYearMax == null || birthYear <= data.birthYearMax))

    const names = new Map<string, string>()
    const rows: { athlete_id: string; test_date: string; [k: string]: number | string | null }[] = []
    // Chunked by athlete (keeps the id list out of URL-length trouble) and paged (PostgREST
    // caps a response at 1000 rows).
    for (let i = 0; i < athleteIds.length; i += 100) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, birth_year')
        .in('id', athleteIds.slice(i, i + 100))
      const kept = (profiles || []).filter((p) => inAgeRange(p.birth_year))
      for (const p of kept) names.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim())
      const chunk = kept.map((p) => p.id)
      if (chunk.length === 0) continue

      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await supabaseAdmin
          .from('performance_metrics')
          .select(`athlete_id, test_date, ${REPORT_METRIC_FIELDS.join(', ')}`)
          .in('athlete_id', chunk)
          .gte('test_date', data.startISO)
          .lte('test_date', data.endISO)
          .order('test_date', { ascending: true })
          .range(from, from + 999)
        if (error) return { success: false, error: formatError(error) }
        rows.push(...((page || []) as unknown as typeof rows))
        if (!page || page.length < 1000) break
      }
    }

    const series = {} as GroupsMetricsReport['series']
    const best = {} as GroupsMetricsReport['best']
    const change = {} as GroupsMetricsReport['change']
    const groupChange = {} as GroupsMetricsReport['groupChange']
    const inGroup = (athleteId: string, key: string) => key === 'all' || !!groupsByAthlete.get(athleteId)?.includes(key)
    const groupKeys = ['all', ...groups.map((g) => g.id)]

    for (const field of REPORT_METRIC_FIELDS) {
      const mode = BEST_MODE[field]
      // Each athlete's readings for this metric, oldest first.
      const byAthlete = new Map<string, { date: string; value: number }[]>()
      for (const r of rows) {
        const v = r[field]
        if (v === null || v === undefined) continue
        if (!byAthlete.has(r.athlete_id)) byAthlete.set(r.athlete_id, [])
        byAthlete.get(r.athlete_id)!.push({ date: r.test_date, value: Number(v) })
      }

      // Weekly series: average each athlete within the week first, then average athletes, so
      // someone tested five times that week doesn't outweigh someone tested once.
      const weekAthlete = new Map<string, Map<string, { sum: number; n: number }>>()
      for (const [athleteId, points] of byAthlete) {
        for (const p of points) {
          const week = mondayOfUTC(p.date)
          if (!weekAthlete.has(week)) weekAthlete.set(week, new Map())
          const cell = weekAthlete.get(week)!.get(athleteId) || { sum: 0, n: 0 }
          cell.sum += p.value
          cell.n += 1
          weekAthlete.get(week)!.set(athleteId, cell)
        }
      }
      series[field] = [...weekAthlete.keys()].sort().map((week) => {
        const perAthlete = [...weekAthlete.get(week)!.entries()].map(([id, c]) => ({ id, avg: c.sum / c.n }))
        const mean = (list: { avg: number }[]) => (list.length ? list.reduce((a, b) => a + b.avg, 0) / list.length : null)
        const row: Record<string, number | string | null> = { test_date: week, all: mean(perAthlete) }
        for (const g of groups) row[g.id] = mean(perAthlete.filter((a) => groupsByAthlete.get(a.id)?.includes(g.id)))
        return row
      })

      best[field] = [...byAthlete.entries()]
        .map(([athleteId, points]) => ({
          athleteId,
          name: names.get(athleteId) || 'Unknown',
          value:
            mode === 'max'
              ? Math.max(...points.map((p) => p.value))
              : mode === 'min'
                ? Math.min(...points.map((p) => p.value))
                : points[points.length - 1].value,
        }))
        // Best first: highest, or shortest for phase durations.
        .sort((a, b) => (mode === 'min' ? a.value - b.value : b.value - a.value))

      // % change from the first reading in range to the best reading after it (so an athlete
      // only shows a decline if every later test was worse than their first). Weight and impulse
      // ratio have no "best", so they compare first to most recent. Needs two different test days.
      change[field] = [...byAthlete.entries()]
        .filter(([, points]) => points.length >= 2 && points[0].date !== points[points.length - 1].date && points[0].value !== 0)
        .map(([athleteId, points]) => {
          const first = points[0]
          const later = points.slice(1)
          const compare =
            mode === 'max'
              ? later.reduce((best, p) => (p.value > best.value ? p : best))
              : mode === 'min'
                ? later.reduce((best, p) => (p.value < best.value ? p : best))
                : later[later.length - 1]
          return {
            athleteId,
            name: names.get(athleteId) || 'Unknown',
            first: first.value,
            compare: compare.value,
            firstDate: first.date,
            compareDate: compare.date,
            pct: ((compare.value - first.value) / first.value) * 100,
          }
        })
        // Most improved first (biggest drop for phase durations).
        .sort((a, b) => (mode === 'min' ? a.pct - b.pct : b.pct - a.pct))

      groupChange[field] = Object.fromEntries(
        groupKeys.map((key) => {
          const pcts = change[field].filter((c) => inGroup(c.athleteId, key)).map((c) => c.pct)
          return [key, pcts.length ? { median: median(pcts), n: pcts.length } : null]
        })
      )
    }

    const cmjPoints: CmjPoint[] = rows
      .filter((r) => r.cmj_impulse_ratio !== null && r.cmj_impulse_ratio !== undefined)
      .map((r) => ({
        athleteId: r.athlete_id,
        name: names.get(r.athlete_id) || 'Unknown',
        date: r.test_date,
        impulseRatio: Number(r.cmj_impulse_ratio),
        brakingForce: r.cmj_avg_rel_braking_force == null ? null : Number(r.cmj_avg_rel_braking_force),
        propForce: r.cmj_avg_rel_prop_force == null ? null : Number(r.cmj_avg_rel_prop_force),
      }))

    // Rows are oldest first, so each athlete's first point is their first CMJ in range.
    const firstLatest = new Map<string, { first: JumpStrategy; latest: JumpStrategy }>()
    for (const p of cmjPoints) {
      const s = jumpStrategy(p.impulseRatio)
      const prev = firstLatest.get(p.athleteId)
      firstLatest.set(p.athleteId, { first: prev ? prev.first : s, latest: s })
    }
    const zeroCounts = (): StrategyCounts => ({ braking: 0, balanced: 0, propulsive: 0 })
    const strategy: GroupsMetricsReport['strategy'] = {}
    for (const key of groupKeys) {
      const entry = { first: zeroCounts(), latest: zeroCounts() }
      for (const [athleteId, s] of firstLatest) {
        if (!inGroup(athleteId, key)) continue
        entry.first[s.first] += 1
        entry.latest[s.latest] += 1
      }
      strategy[key] = entry
    }

    // `names` holds exactly the athletes that passed the age filter.
    const memberCounts = new Map<string, number>()
    for (const r of memberRows || []) {
      if (names.has(r.athlete_id)) memberCounts.set(r.group_id, (memberCounts.get(r.group_id) || 0) + 1)
    }

    const report: GroupsMetricsReport = {
      groups: groups.map((g) => ({ id: g.id, name: g.name, locationName: g.locationName, memberCount: memberCounts.get(g.id) || 0 })),
      athleteCount: names.size,
      series,
      best,
      change,
      groupChange,
      cmjPoints,
      strategy,
    }
    return { success: true, report }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
