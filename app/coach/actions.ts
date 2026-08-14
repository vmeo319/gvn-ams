'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Fallback to anon key if service role is somehow completely blocked
const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function hasAuthAccount(id: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  return res.status === 200
}

async function getAppOrigin(): Promise<string> {
  const hdrs = await headers()
  const host = hdrs.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
}

const formatError = (err: any) => {
  if (!err) return 'Unknown error.'
  if (typeof err === 'string') return err
  if (err.message && err.message !== '{}') return err.message
  try {
    const str = JSON.stringify(err)
    if (str !== '{}') return str
  } catch (e) {}
  return 'The email/username is likely already taken, or the server blocked the request.'
}

interface AthleteUpsertData {
  firstName: string
  lastName: string
  email?: string
  birthYear?: number
  position?: string
  heightInches?: number
  weightLbs?: number
  locationId?: string
}

// Adds/edits an athlete by name. Name is the only required field — every other field
// (email, height/weight, location, position, birth year) is optional and independent:
// a coach can set any subset of them in one call. If a profile with that name already
// exists (e.g. an unclaimed roster row), the provided fields update it in place rather
// than creating a duplicate. If an email is provided and this athlete has no login yet,
// an invite link is generated (not emailed) for the coach to share directly.
export async function upsertAthleteAction(data: AthleteUpsertData) {
  try {
    const cleanFirstName = data.firstName.trim()
    const cleanLastName = data.lastName.trim()
    if (!cleanFirstName || !cleanLastName) {
      return { success: false, error: 'First and last name are required.' }
    }
    const cleanEmail = data.email?.trim().toLowerCase() || null

    const overrides: Record<string, any> = {}
    if (data.birthYear !== undefined && data.birthYear !== null) overrides.birth_year = data.birthYear
    if (data.position) overrides.position = data.position
    if (data.heightInches !== undefined && data.heightInches !== null) overrides.height_inches = data.heightInches
    if (data.weightLbs !== undefined && data.weightLbs !== null) overrides.weight_lbs = data.weightLbs
    if (data.locationId) overrides.location_id = data.locationId

    const { data: existingAthlete } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('first_name', cleanFirstName)
      .ilike('last_name', cleanLastName)
      .maybeSingle()

    // No email: this is a pure profile create/update, no login involved.
    if (!cleanEmail) {
      if (existingAthlete) {
        if (Object.keys(overrides).length > 0) {
          const { error } = await supabaseAdmin.from('profiles').update(overrides).eq('id', existingAthlete.id)
          if (error) return { success: false, error: formatError(error) }
        }
        return { success: true, message: 'Athlete profile updated.' }
      }
      const { error } = await supabaseAdmin
        .from('profiles')
        .insert({ first_name: cleanFirstName, last_name: cleanLastName, role: 'athlete', ...overrides })
      if (error) return { success: false, error: formatError(error) }
      return { success: true, message: 'New athlete profile created (no login yet — they can claim it from the sign-up page).' }
    }

    // Email provided: this athlete needs (or already has) a login.
    if (existingAthlete) {
      const alreadyClaimed = await hasAuthAccount(existingAthlete.id)
      if (alreadyClaimed) {
        if (Object.keys(overrides).length > 0) {
          const { error } = await supabaseAdmin.from('profiles').update(overrides).eq('id', existingAthlete.id)
          if (error) return { success: false, error: formatError(error) }
        }
        return { success: true, message: 'This athlete already has a login — their profile details were updated instead.' }
      }

      // `profiles` has a unique constraint on (first_name, last_name), and creating a new
      // auth user auto-creates a profiles row via a DB trigger using that same name — so
      // the orphaned row has to be renamed out of the way first or the trigger's insert
      // collides.
      const holdName = `__claiming_${existingAthlete.id}`
      await supabaseAdmin
        .from('profiles')
        .update({ first_name: holdName, last_name: holdName })
        .eq('id', existingAthlete.id)

      const origin = await getAppOrigin()
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: cleanEmail,
        options: {
          data: { first_name: cleanFirstName, last_name: cleanLastName },
          redirectTo: `${origin}/invite`,
        },
      })

      if (inviteErr || !inviteData?.user) {
        await supabaseAdmin
          .from('profiles')
          .update({ first_name: cleanFirstName, last_name: cleanLastName })
          .eq('id', existingAthlete.id)
        return { success: false, error: `Invite failed: ${formatError(inviteErr)}` }
      }

      const newUserId = inviteData.user.id

      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(
        {
          id: newUserId,
          first_name: cleanFirstName,
          last_name: cleanLastName,
          role: 'athlete',
          birth_year: overrides.birth_year ?? existingAthlete.birth_year,
          position: overrides.position ?? existingAthlete.position,
          height_inches: overrides.height_inches ?? existingAthlete.height_inches,
          weight_lbs: overrides.weight_lbs ?? existingAthlete.weight_lbs,
          location_id: overrides.location_id ?? existingAthlete.location_id,
        },
        { onConflict: 'id' }
      )
      if (profileErr) return { success: false, error: formatError(profileErr) }

      await supabaseAdmin
        .from('performance_metrics')
        .update({ athlete_id: newUserId })
        .eq('athlete_id', existingAthlete.id)
      await supabaseAdmin.from('profiles').delete().eq('id', existingAthlete.id)

      return {
        success: true,
        inviteLink: inviteData.properties?.action_link,
        message: 'Invite link created — share it with the athlete to activate their account.',
      }
    }

    // No existing profile at all: brand new athlete, created straight from an invite.
    const origin = await getAppOrigin()
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: cleanEmail,
      options: {
        data: { first_name: cleanFirstName, last_name: cleanLastName },
        redirectTo: `${origin}/invite`,
      },
    })

    if (inviteErr || !inviteData?.user) {
      return { success: false, error: `Invite failed: ${formatError(inviteErr)}` }
    }

    const newUserId = inviteData.user.id
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: newUserId, first_name: cleanFirstName, last_name: cleanLastName, role: 'athlete', ...overrides }, { onConflict: 'id' })
    if (profileErr) return { success: false, error: formatError(profileErr) }

    return {
      success: true,
      inviteLink: inviteData.properties?.action_link,
      message: 'Invite link created — share it with the athlete to activate their account.',
    }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// ============================================================================
// HELPER FUNCTIONS & UPLOADS
// ============================================================================

async function getOrCreateAthleteId(rawName: string, profilesMap: Map<string, string>): Promise<string | null> {
  const cleanName = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const lowerKey = cleanName.toLowerCase()
  
  if (profilesMap.has(lowerKey)) return profilesMap.get(lowerKey)!

  const parts = cleanName.split(' ')
  const firstName = parts[0] || 'Unknown'
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown'
  
  // Dummy email for background imports
  const fakeEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}_${Math.random().toString(36).substring(2, 7)}@gvn-placeholder.com`

  try {
    // Standard signup for dummy accounts too
    const { data: authData, error: authErr } = await supabaseAdmin.auth.signUp({
      email: fakeEmail,
      password: 'TemporaryPassword123!',
      options: {
        data: { first_name: firstName, last_name: lastName }
      }
    })

    if (authErr || !authData?.user) return null
    
    const userId = authData.user.id

    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      location: 'GVN- North Shore',
      role: 'athlete'
    })

    profilesMap.set(lowerKey, userId)
    return userId
  } catch {
    return null
  }
}

export async function uploadMetricRows(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, first_name, last_name, weight_lbs')
  const profilesMap = new Map<string, string>()
  ;(profiles || []).forEach(p => { profilesMap.set(`${p.first_name} ${p.last_name}`.trim().toLowerCase(), p.id) })

  for (const row of rows) {
    const rawName = row.name || row['Athlete Name'] || row['Athlete'] || `${row.first_name || row['First Name'] || ''} ${row.last_name || row['Last Name'] || ''}`.trim()
    if (!rawName) continue
    const athleteId = await getOrCreateAthleteId(rawName, profilesMap)
    if (!athleteId) continue

    const testDate = row.test_date || row['Test Date'] || new Date().toISOString().split('T')[0]
    let isoPeakForce = row.iso_belt_squat_peak_force || row.iso_peak_force || row['ISO Peak Force (N/kg)'] || row['Relative Peak Force (BW)']
    const v0Speed = row.v0_speed || row['V0 Speed']
    const cmjHeight = row.cmj_height_inches || row.cmj_height_in || row['CMJ Height (in)'] || row['Jump Height']
    const weightLbs = row.weight_lbs || row['Weight'] || row['Weight (lbs)']

    const metricPayload: Record<string, any> = {
      athlete_id: athleteId,
      test_date: testDate,
      iso_belt_squat_peak_force: isoPeakForce ? Number(Number(isoPeakForce).toFixed(2)) : null,
      v0_speed: v0Speed ? Number(v0Speed) : null,
      cmj_height_inches: cmjHeight ? Number(Number(cmjHeight).toFixed(2)) : null,
    }
    // Only set weight_lbs when the row actually has it — omitting the key (rather than
    // defaulting it) means an upsert conflict leaves an existing real reading untouched.
    if (weightLbs) metricPayload.weight_lbs = Number(weightLbs)

    const { error } = await supabaseAdmin.from('performance_metrics').upsert(metricPayload, { onConflict: 'athlete_id, test_date' })
    if (!error) insertedCount++
  }

  if (insertedCount > 0) {
    await supabaseAdmin.from('import_status').upsert(
      { source: 'excel', last_imported_at: new Date().toISOString(), triggered_by: 'manual', records_count: insertedCount },
      { onConflict: 'source, triggered_by' }
    )
  }

  return { success: true, insertedCount, errors }
}

export async function addAthleteNoteAction(data: {
  athleteId: string
  authorId: string
  entryType: 'note' | 'injury' | 'goal'
  body: string
}) {
  const { error } = await supabaseAdmin.from('athlete_notes').insert({
    athlete_id: data.athleteId,
    author_id: data.authorId,
    entry_type: data.entryType,
    body: data.body,
  })
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}

// Creates a coach-issued invite link tied to one athlete. Unlike the athlete-invite flow
// above, this doesn't call auth.admin.generateLink — that provisions a brand-new auth user
// at generation time and only supports a single one-time claim, which breaks the moment a
// parent with an existing account needs to link a second child. Instead this issues a
// lightweight token that the claim page (app/parent-invite/actions.ts) resolves against
// whatever session (new or existing) the parent has when they open the link.
export async function createParentInviteAction(data: { athleteId: string; coachId: string; email?: string }) {
  try {
    const { data: invite, error } = await supabaseAdmin
      .from('parent_invites')
      .insert({
        athlete_id: data.athleteId,
        created_by: data.coachId,
        email: data.email?.trim().toLowerCase() || null,
      })
      .select('token')
      .single()

    if (error) return { success: false, error: formatError(error) }

    const origin = await getAppOrigin()
    return { success: true, inviteLink: `${origin}/parent-invite/${invite.token}` }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function uploadHawkinsScoreboardCSV(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, first_name, last_name, weight_lbs')
  const profilesMap = new Map<string, string>()
  ;(profiles || []).forEach(p => { profilesMap.set(`${p.first_name} ${p.last_name}`.trim().toLowerCase(), p.id) })

  const sessionMap = new Map<string, { athleteId: string; testDate: string; cmjHeight: number | null; isoForce: number | null }>()

  for (const row of rows) {
    const rawName = String(row.Name || row.name || '').trim()
    if (!rawName) continue

    const athleteId = await getOrCreateAthleteId(rawName, profilesMap)
    if (!athleteId) continue

    let testDate = new Date().toISOString().split('T')[0]
    const rawDate = row.Date || row.date
    if (rawDate) {
      const dateStr = String(rawDate).trim()
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const [m, d, y] = parts
          testDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
      } else if (dateStr.includes('-')) {
        testDate = dateStr.split('T')[0]
      }
    }

    const testType = String(row.Type || row.type || '').toLowerCase()
    const tags = String(row.Tags || row.tags || '').toLowerCase()

    let cmjInches: number | null = null
    let isoForceNkg: number | null = null

    if (testType.includes('countermovement') || row['Jump Height'] !== undefined) {
      const rawJump = Number(row['Jump Height'] || row.jump_height)
      if (!isNaN(rawJump) && rawJump > 0) cmjInches = Number(rawJump.toFixed(2))
    }

    if (testType.includes('isometric')) {
      const isTargetISO = tags.includes('iso belt squat - 45') || tags.includes('iso belt squat- 45')
      const isExcluded = tags.includes('120') || tags.includes('mid-thigh') || tags.includes('floor press') || tags.includes('sprinter')

      if (isTargetISO && !isExcluded) {
        const rawForce = Number(row['Relative Peak Force (BW)'] || row['Relative Peak Force'] || row.relative_peak_force)
        if (!isNaN(rawForce) && rawForce > 0) {
          if (rawForce >= 15.0 && rawForce <= 150.0) isoForceNkg = Number(rawForce.toFixed(2))
          else if (rawForce < 2.0) isoForceNkg = Number((rawForce * 98.0665).toFixed(2))
          else if (rawForce < 15.0) isoForceNkg = Number((rawForce * 9.80665).toFixed(2))
        }
      }
    }

    if (cmjInches === null && isoForceNkg === null) continue

    const sessionKey = `${athleteId}_${testDate}`
    const existing = sessionMap.get(sessionKey)

    sessionMap.set(sessionKey, {
      athleteId,
      testDate,
      cmjHeight: cmjInches !== null ? cmjInches : existing?.cmjHeight || null,
      isoForce: isoForceNkg !== null ? isoForceNkg : existing?.isoForce || null,
    })
  }

  const sessionsArray = Array.from(sessionMap.values())

  for (const session of sessionsArray) {
    const payload: Record<string, any> = { athlete_id: session.athleteId, test_date: session.testDate }
    if (session.cmjHeight !== null) payload.cmj_height_inches = session.cmjHeight
    if (session.isoForce !== null) payload.iso_belt_squat_peak_force = session.isoForce

    const { error } = await supabaseAdmin.from('performance_metrics').upsert(payload, { onConflict: 'athlete_id, test_date' })
    if (!error) insertedCount++
  }

  if (insertedCount > 0) {
    await supabaseAdmin.from('import_status').upsert(
      { source: 'hawkins', last_imported_at: new Date().toISOString(), triggered_by: 'manual', records_count: insertedCount },
      { onConflict: 'source, triggered_by' }
    )
  }

  return { success: true, insertedCount, errors }
}

async function callSyncFunction(source: 'sync-hawkins' | 'sync-1080', body: Record<string, unknown>) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${source}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

// Manually invokes the same edge functions the nightly cron jobs call, using the same
// service-role bearer auth (supabase/migrations/20260805030000_fix_cron_jobs.sql) — lets
// a coach force a sync from the dashboard without waiting for the schedule. Both edge
// functions accept triggeredBy so this shows up correctly as "Manual" rather than
// clobbering the real last-automatic-run timestamp.
export async function triggerManualSyncAction(data: { source: 'sync-hawkins' | 'sync-1080' }) {
  try {
    if (data.source === 'sync-hawkins') {
      const { ok, status, json } = await callSyncFunction('sync-hawkins', { triggeredBy: 'manual' })
      if (!ok) return { success: false, error: formatError(json?.error || `HTTP ${status}`) }
      return { success: true, result: json }
    }

    // 1080 is two steps in the real pipeline — enqueue (discover new/older sessions) then
    // process_batch (fetch each session's real metrics and write them) — and only the
    // latter ever touches import_status. Running just "enqueue" here would silently do
    // nothing visible until the next 5-minute auto-drain cron picks it up and tags it
    // 'auto', so this does both immediately and reports the processing step's result.
    await callSyncFunction('sync-1080', { mode: 'enqueue', lookbackDays: 14 })
    const { ok, status, json } = await callSyncFunction('sync-1080', {
      mode: 'process_batch',
      batchSize: 100,
      triggeredBy: 'manual',
    })
    if (!ok) return { success: false, error: formatError(json?.error || `HTTP ${status}`) }
    return { success: true, result: json }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
