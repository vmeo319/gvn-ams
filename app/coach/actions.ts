'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const formatError = (err: any) => {
  if (!err) return 'Unknown error.'
  if (typeof err === 'string') return err
  if (err.message && err.message !== '{}') return err.message
  try {
    const str = JSON.stringify(err)
    if (str !== '{}') return str
  } catch (e) {}
  return 'Supabase API 500 Error: Server timeout or email rate limit exceeded.'
}

interface NewAthleteData {
  email: string
  password: string
  firstName: string
  lastName: string
  birthYear: number
  position: string
  heightInches: number
  weightLbs: number
  location?: string
}

export async function createAthleteAction(data: NewAthleteData) {
  try {
    if (!serviceRoleKey) {
      return { success: false, error: 'SYSTEM HALTED: Vercel is missing the SUPABASE_SERVICE_ROLE_KEY.' }
    }

    const cleanEmail = data.email.trim().toLowerCase()
    const cleanFirstName = data.firstName.trim()
    const cleanLastName = data.lastName.trim()

    if (!cleanEmail || !data.password) return { success: false, error: 'Email and password are required.' }
    if (data.password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' }

    // Check if the athlete exists in profiles
    const { data: existingAthlete } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('first_name', cleanFirstName)
      .ilike('last_name', cleanLastName)
      .maybeSingle()

    let finalUserId: string | undefined

    if (existingAthlete) {
      // 1. UPGRADE EXISTING PLACEHOLDER
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(existingAthlete.id)
      const currentEmail = authData?.user?.email || ''

      if (currentEmail.includes('@gvn-placeholder.com')) {
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(
          existingAthlete.id,
          { email: cleanEmail, password: data.password, email_confirm: true }
        )
        if (updateAuthErr) return { success: false, error: `Failed to upgrade email: ${formatError(updateAuthErr)}` }
        finalUserId = existingAthlete.id
      } else {
        return { success: false, error: `An active account for "${cleanFirstName} ${cleanLastName}" already exists.` }
      }
    } else {
      // 2. CREATE BRAND NEW USER
      const { data: adminAuth, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: { first_name: cleanFirstName, last_name: cleanLastName },
      })
      if (adminErr || !adminAuth?.user) return { success: false, error: `Failed to create user: ${formatError(adminErr)}` }
      finalUserId = adminAuth.user.id
    }

    if (!finalUserId) return { success: false, error: 'Failed to establish user ID.' }

    // Update their profile details
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: finalUserId,
      first_name: cleanFirstName,
      last_name: cleanLastName,
      birth_year: data.birthYear,
      position: data.position,
      height_inches: data.heightInches,
      weight_lbs: data.weightLbs,
      location: data.location || 'GVN- North Shore',
      role: 'athlete'
    }, { onConflict: 'id' })

    if (profileError) return { success: false, error: formatError(profileError) }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// ============================================================================
// HELPER FUNCTIONS & UPLOADS
// ============================================================================

function findProfileId(rawName: string, profiles: any[]): string | null {
  if (!rawName) return null
  const clean = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const parts = clean.split(' ')
  const first = parts[0]
  const last = parts[parts.length - 1]

  const match = profiles.find((p) => {
    const pf = (p.first_name || '').trim().toLowerCase()
    const pl = (p.last_name || '').trim().toLowerCase()
    return clean === `${pf} ${pl}` || clean === `${pl} ${pf}` || (pf === first && pl === last) || (pf === last && pl === first)
  })

  return match ? match.id : null
}

async function getOrCreateAthleteId(rawName: string, profilesMap: Map<string, string>): Promise<string | null> {
  const cleanName = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const lowerKey = cleanName.toLowerCase()
  
  if (profilesMap.has(lowerKey)) return profilesMap.get(lowerKey)!

  const parts = cleanName.split(' ')
  const firstName = parts[0] || 'Unknown'
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown'
  const fakeEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}_${Math.random().toString(36).substring(2, 7)}@gvn-placeholder.com`

  try {
    let userId: string | undefined

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: 'TemporaryPassword123!',
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })

    if (authErr || !authData?.user) return null
    userId = authData.user.id

    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      weight_lbs: 180,
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

    const metricPayload = {
      athlete_id: athleteId,
      test_date: testDate,
      iso_belt_squat_peak_force: isoPeakForce ? Number(Number(isoPeakForce).toFixed(2)) : null,
      v0_speed: v0Speed ? Number(v0Speed) : null,
      cmj_height_inches: cmjHeight ? Number(Number(cmjHeight).toFixed(2)) : null,
      weight_lbs: 180,
    }

    const { error } = await supabaseAdmin.from('performance_metrics').upsert(metricPayload, { onConflict: 'athlete_id, test_date' })
    if (!error) insertedCount++
  }

  return { success: true, insertedCount, errors }
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

  return { success: true, insertedCount, errors }
}