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

export async function listGroupsWithCounts() {
  try {
    const { data: groups, error } = await supabaseAdmin.from('groups').select('id, name').order('name')
    if (error) return { success: false, error: formatError(error), results: [] }

    const { data: memberships } = await supabaseAdmin.from('athlete_groups').select('group_id')
    const counts = new Map<string, number>()
    for (const m of memberships || []) counts.set(m.group_id, (counts.get(m.group_id) || 0) + 1)

    return {
      success: true,
      results: (groups || []).map((g) => ({ id: g.id, name: g.name, athleteCount: counts.get(g.id) || 0 })),
    }
  } catch (err: any) {
    return { success: false, error: formatError(err), results: [] }
  }
}

// Select-then-insert (not upsert(onConflict)) — same reasoning as exercise_library's
// createLibraryExercise: the unique index is a lower(trim(name)) expression, which
// PostgREST's onConflict can't target with plain column syntax.
export async function createGroupAction(data: { name: string }) {
  try {
    const name = data.name.trim()
    if (!name) return { success: false, error: 'Group name is required.' }

    const { data: existing } = await supabaseAdmin.from('groups').select('id, name').ilike('name', name).maybeSingle()
    if (existing) return { success: true, group: existing }

    const { data: inserted, error } = await supabaseAdmin.from('groups').insert({ name }).select('id, name').single()
    if (error) {
      const { data: raceWinner } = await supabaseAdmin.from('groups').select('id, name').ilike('name', name).maybeSingle()
      if (raceWinner) return { success: true, group: raceWinner }
      return { success: false, error: formatError(error) }
    }
    return { success: true, group: inserted }
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
export async function updateAthleteGroupsAction(data: { athleteId: string; groupIds: string[] }) {
  try {
    const { error: deleteErr } = await supabaseAdmin.from('athlete_groups').delete().eq('athlete_id', data.athleteId)
    if (deleteErr) return { success: false, error: formatError(deleteErr) }

    if (data.groupIds.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('athlete_groups')
        .insert(data.groupIds.map((groupId) => ({ athlete_id: data.athleteId, group_id: groupId })))
      if (insertErr) return { success: false, error: formatError(insertErr) }
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
    const { data: group, error: groupErr } = await supabaseAdmin
      .from('groups')
      .select('id, name')
      .eq('id', data.groupId)
      .single()
    if (groupErr || !group) return { success: false, error: 'Group not found.' }

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

// One week (7 consecutive dates starting weekStartISO) of attendance for every member of
// the group — sparse (only marked days have a row), the client fills in the unmarked gaps.
export async function getWeekAttendance(data: { groupId: string; weekStartISO: string }) {
  const start = new Date(data.weekStartISO + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const endISO = end.toISOString().split('T')[0]

  const { data: rows, error } = await supabaseAdmin
    .from('group_attendance')
    .select('athlete_id, attendance_date, present')
    .eq('group_id', data.groupId)
    .gte('attendance_date', data.weekStartISO)
    .lte('attendance_date', endISO)

  if (error) return { success: false, error: formatError(error), results: [] }
  return { success: true, results: rows || [] }
}

export async function setAttendanceAction(data: {
  groupId: string
  athleteId: string
  date: string
  present: boolean
  markedBy: string
}) {
  const { error } = await supabaseAdmin.from('group_attendance').upsert(
    {
      group_id: data.groupId,
      athlete_id: data.athleteId,
      attendance_date: data.date,
      present: data.present,
      marked_by: data.markedBy,
      marked_at: new Date().toISOString(),
    },
    { onConflict: 'group_id, athlete_id, attendance_date' }
  )
  if (error) return { success: false, error: formatError(error) }

  // Showing up is one real-world event -- if the athlete belongs to other groups too, mark
  // them present there for the same date as well, so attendance (and the billing-facing
  // days-attended count, which unions across groups) doesn't depend on which group's tab a
  // coach happened to check them off in. Marking someone absent stays scoped to the group a
  // coach is correcting, since that's normally fixing that group's record, not un-doing the
  // athlete's whole day.
  if (data.present) {
    const { data: otherMemberships } = await supabaseAdmin
      .from('athlete_groups')
      .select('group_id')
      .eq('athlete_id', data.athleteId)
      .neq('group_id', data.groupId)

    if (otherMemberships && otherMemberships.length > 0) {
      await supabaseAdmin.from('group_attendance').upsert(
        otherMemberships.map((g) => ({
          group_id: g.group_id,
          athlete_id: data.athleteId,
          attendance_date: data.date,
          present: true,
          marked_by: data.markedBy,
          marked_at: new Date().toISOString(),
        })),
        { onConflict: 'group_id, athlete_id, attendance_date' }
      )
    }
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

// Distinct dates an athlete was marked present, across every group they belong to -- the
// billing-facing "days attended" figure. Cross-group cascading in setAttendanceAction means a
// single visit is present in every group's rows for that date, but dedupe here anyway in case
// a coach later marks one group absent while another still has it present for the same day.
export async function getAthleteAttendedDates(data: { athleteId: string; sinceISO?: string }) {
  try {
    let query = supabaseAdmin
      .from('group_attendance')
      .select('attendance_date')
      .eq('athlete_id', data.athleteId)
      .eq('present', true)
    if (data.sinceISO) query = query.gte('attendance_date', data.sinceISO)

    const { data: rows, error } = await query
    if (error) return { success: false, error: formatError(error), dates: [] }

    const dates = Array.from(new Set((rows || []).map((r) => r.attendance_date))).sort()
    return { success: true, dates }
  } catch (err: any) {
    return { success: false, error: formatError(err), dates: [] }
  }
}
