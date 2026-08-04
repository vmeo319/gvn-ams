'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

/**
 * 1. ACTION: Create or Upgrade Athlete Profile
 */
export async function createAthleteAction(data: NewAthleteData) {
  try {
    const cleanEmail = data.email.trim().toLowerCase()
    const cleanFirstName = data.firstName.trim()
    const cleanLastName = data.lastName.trim()

    const { data: existingAthlete } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('first_name', cleanFirstName)
      .ilike('last_name', cleanLastName)
      .maybeSingle()

    if (existingAthlete) {
      // Fetch the user's auth account to check if it's a placeholder
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(existingAthlete.id)
      
      if (authData?.user) {
        const currentEmail = authData.user.email || ''
        
        // If they have a placeholder email, upgrade them to a real account
        if (currentEmail.includes('@gvn-placeholder.com')) {
          const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(
            existingAthlete.id,
            {
              email: cleanEmail,
              password: data.password,
              email_confirm: true,
              user_metadata: {
                first_name: cleanFirstName,
                last_name: cleanLastName,
              }
            }
          )
          
          if (updateAuthErr) {
            let errStr = updateAuthErr.message
            if (!errStr || errStr === '{}') errStr = JSON.stringify(updateAuthErr)
            if (errStr === '{}') errStr = 'Failed to update email. This email may already be in use by another account.'
            return { success: false, error: errStr }
          }

          // Update their physical stats while we're at it
          const { error: profileErr } = await supabaseAdmin
            .from('profiles')
            .update({
              birth_year: data.birthYear,
              position: data.position,
              height_inches: data.heightInches,
              weight_lbs: data.weightLbs,
              location: data.location || 'GVN- North Shore',
            })
            .eq('id', existingAthlete.id)

          if (profileErr) return { success: false, error: profileErr.message }

          return { success: true }
        } else {
          return {
            success: false,
            error: `An athlete named "${cleanFirstName} ${cleanLastName}" already has an active account.`,
          }
        }
      }
    }

    // If no existing athlete is found, create a brand new one
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: cleanFirstName,
        last_name: cleanLastName,
      },
    })

    if (authError) {
      let errStr = authError.message
      if (!errStr || errStr === '{}') errStr = JSON.stringify(authError)
      if (errStr === '{}') errStr = 'Failed to create user. The email address might already be in use.'
      return { success: false, error: errStr }
    }
    
    if (!authData.user) return { success: false, error: 'User creation failed.' }

    const userId = authData.user.id

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          first_name: cleanFirstName,
          last_name: cleanLastName,
          birth_year: data.birthYear,
          position: data.position,
          height_inches: data.heightInches,
          weight_lbs: data.weightLbs,
          location: data.location || 'GVN- North Shore',
          role: 'athlete',
        },
        { onConflict: 'id' }
      )

    if (profileError) return { success: false, error: profileError.message }

    return { success: true }
  } catch (err: any) {
    let msg = err.message || JSON.stringify(err)
    if (msg === '{}') msg = 'An unexpected server error occurred.'
    return { success: false, error: msg }
  }
}

/**
 * 2. Helper: Strict Name Matcher
 */
function findProfileId(rawName: string, profiles: any[]): string | null {
  if (!rawName) return null
  const clean = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const parts = clean.split(' ')
  const first = parts[0]
  const last = parts[parts.length - 1]

  const match = profiles.find((p) => {
    const pf = (p.first_name || '').trim().toLowerCase()
    const pl = (p.last_name || '').trim().toLowerCase()
    return (
      clean === `${pf} ${pl}` ||
      clean === `${pl} ${pf}` ||
      (pf === first && pl === last) ||
      (pf === last && pl === first)
    )
  })

  return match ? match.id : null
}

/**
 * Helper: Quick stub creator for unmapped athletes
 */
async function getOrCreateAthleteId(rawName: string, profilesMap: Map<string, string>): Promise<string | null> {
  const cleanName = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const lowerKey = cleanName.toLowerCase()
  
  if (profilesMap.has(lowerKey)) {
    return profilesMap.get(lowerKey)!
  }

  const parts = cleanName.split(' ')
  const firstName = parts[0] || 'Unknown'
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Unknown'
  const fakeEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}_${Math.random().toString(36).substring(2, 7)}@gvn-placeholder.com`

  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: 'TemporaryPassword123!',
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })

    if (authErr || !authData?.user) return null
    const userId = authData.user.id

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

/**
 * 3. ACTION: Parse & Ingest General Metric Rows
 */
export async function uploadMetricRows(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, weight_lbs')

  const profilesMap = new Map<string, string>()
  ;(profiles || []).forEach(p => {
    profilesMap.set(`${p.first_name} ${p.last_name}`.trim().toLowerCase(), p.id)
  })

  for (const row of rows) {
    const rawName =
      row.name ||
      row['Athlete Name'] ||
      row['Athlete'] ||
      `${row.first_name || row['First Name'] || ''} ${row.last_name || row['Last Name'] || ''}`.trim()

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

    const { error } = await supabaseAdmin
      .from('performance_metrics')
      .upsert(metricPayload, { onConflict: 'athlete_id, test_date' })

    if (!error) insertedCount++
  }

  return { success: true, insertedCount, errors }
}

/**
 * FAST BATCH CHUNK UPLOAD FOR HAWKINS MASTER CSVs
 */
export async function uploadHawkinsScoreboardCSV(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, weight_lbs')

  const profilesMap = new Map<string, string>()
  ;(profiles || []).forEach(p => {
    profilesMap.set(`${p.first_name} ${p.last_name}`.trim().toLowerCase(), p.id)
  })

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

    // CMJ Jump Height
    if (testType.includes('countermovement') || row['Jump Height'] !== undefined) {
      const rawJump = Number(row['Jump Height'] || row.jump_height)
      if (!isNaN(rawJump) && rawJump > 0) {
        cmjInches = Number(rawJump.toFixed(2))
      }
    }

    // Isometric ISO Belt Squat - 45
    if (testType.includes('isometric')) {
      const isTargetISO = tags.includes('iso belt squat - 45') || tags.includes('iso belt squat- 45')
      const isExcluded = tags.includes('120') || tags.includes('mid-thigh') || tags.includes('floor press') || tags.includes('sprinter')

      if (isTargetISO && !isExcluded) {
        const rawForce = Number(row['Relative Peak Force (BW)'] || row['Relative Peak Force'] || row.relative_peak_force)
        if (!isNaN(rawForce) && rawForce > 0) {
          if (rawForce >= 15.0 && rawForce <= 150.0) {
            isoForceNkg = Number(rawForce.toFixed(2))
          } else if (rawForce < 2.0) {
            isoForceNkg = Number((rawForce * 98.0665).toFixed(2))
          } else if (rawForce < 15.0) {
            isoForceNkg = Number((rawForce * 9.80665).toFixed(2))
          }
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

  // Upsert in small database batches to prevent timeout
  for (const session of sessionsArray) {
    const payload: Record<string, any> = {
      athlete_id: session.athleteId,
      test_date: session.testDate,
    }
    if (session.cmjHeight !== null) payload.cmj_height_inches = session.cmjHeight
    if (session.isoForce !== null) payload.iso_belt_squat_peak_force = session.isoForce

    const { error } = await supabaseAdmin
      .from('performance_metrics')
      .upsert(payload, { onConflict: 'athlete_id, test_date' })

    if (!error) insertedCount++
  }

  return { success: true, insertedCount, errors }
}