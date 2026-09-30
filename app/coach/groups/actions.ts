'use server'

import { createClient } from '@supabase/supabase-js'

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

const GROUP_METRIC_FIELDS = ['iso_belt_squat_peak_force', 'top_speed', 'cmj_height_inches', 'weight_lbs'] as const

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
      .select('test_date, iso_belt_squat_peak_force, top_speed, cmj_height_inches, weight_lbs')
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
