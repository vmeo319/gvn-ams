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
 * 1. ACTION: Create New Athlete Profile
 */
export async function createAthleteAction(data: NewAthleteData) {
  try {
    const cleanEmail = data.email.trim().toLowerCase()
    const cleanFirstName = data.firstName.trim()
    const cleanLastName = data.lastName.trim()

    // Prevent duplicate athlete profiles
    const { data: existingAthlete } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('first_name', cleanFirstName)
      .ilike('last_name', cleanLastName)
      .maybeSingle()

    if (existingAthlete) {
      return {
        success: false,
        error: `An athlete named "${cleanFirstName} ${cleanLastName}" already exists.`,
      }
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: cleanFirstName,
        last_name: cleanLastName,
      },
    })

    if (authError) return { success: false, error: authError.message }
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
    return { success: false, error: err.message || 'An unexpected error occurred.' }
  }
}

/**
 * 2. Helper: Strict Name Matcher for Hawkins/Excel Imports
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
 * 3. ACTION: Parse & Ingest General Metric Rows (Clean Manual Upload)
 */
export async function uploadMetricRows(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, weight_lbs')

  for (const row of rows) {
    const rawName =
      row.name ||
      row['Athlete Name'] ||
      row['Athlete'] ||
      `${row.first_name || row['First Name'] || ''} ${row.last_name || row['Last Name'] || ''}`.trim()

    const athleteId = findProfileId(rawName, profiles || [])

    if (!athleteId) {
      if (rawName.trim()) errors.push(`Athlete "${rawName}" not found in database.`)
      continue
    }

    const matchedProfile = (profiles || []).find((p) => p.id === athleteId)
    const athleteWeightLbs = Number(row.weight_lbs || row['Weight (lbs)'] || matchedProfile?.weight_lbs || 180)

    const testDate = row.test_date || row['Test Date'] || new Date().toISOString().split('T')[0]

    let isoPeakForce = row.iso_belt_squat_peak_force || row.iso_peak_force || row['ISO Peak Force (N/kg)'] || row['Relative Peak Force (BW)']
    const v0Speed = row.v0_speed || row['V0 Speed']
    const cmjHeight = row.cmj_height_inches || row.cmj_height_in || row['CMJ Height (in)'] || row['Jump Height']
    const broadJump = row.broad_jump_inches || row.broad_jump_in || row['Broad Jump (in)']
    const benchVelo = row.bench_velo_ms || row['Bench Velo (m/s)']
    const chinUps = row.chin_ups || row['Chin-ups']

    // Check existing record to avoid ON CONFLICT errors
    const { data: existingRecord } = await supabaseAdmin
      .from('performance_metrics')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('test_date', testDate)
      .maybeSingle()

    const metricPayload = {
      athlete_id: athleteId,
      test_date: testDate,
      iso_belt_squat_peak_force: isoPeakForce ? Number(Number(isoPeakForce).toFixed(2)) : null,
      v0_speed: v0Speed ? Number(v0Speed) : null,
      cmj_height_inches: cmjHeight ? Number(Number(cmjHeight).toFixed(2)) : null,
      broad_jump_inches: broadJump ? Number(broadJump) : null,
      bench_velo_ms: benchVelo ? Number(benchVelo) : null,
      chin_ups: chinUps ? Number(chinUps) : null,
      weight_lbs: athleteWeightLbs,
    }

    let error: any = null
    if (existingRecord) {
      const { error: updateErr } = await supabaseAdmin
        .from('performance_metrics')
        .update(metricPayload)
        .eq('id', existingRecord.id)
      error = updateErr
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('performance_metrics')
        .insert(metricPayload)
      error = insertErr
    }

    if (error) {
      errors.push(`Error saving metrics for "${rawName}": ${error.message}`)
    } else {
      insertedCount++
    }
  }

  return { success: true, insertedCount, errors }
}

/**
 * 4. ACTION: Parse & Ingest Hawkins "Scoreboard" CSV Exports
 */
export async function uploadHawkinsScoreboardCSV(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  // Load profiles for athlete name matching
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, weight_lbs')

  for (const row of rows) {
    const rawName = String(row.Name || row.name || '').trim()
    if (!rawName) continue

    const athleteId = findProfileId(rawName, profiles || [])
    if (!athleteId) {
      errors.push(`Athlete "${rawName}" not found in database.`)
      continue
    }

    // Convert Date from MM/DD/YYYY -> YYYY-MM-DD
    let testDate = new Date().toISOString().split('T')[0]
    const rawDate = row.Date || row.date
    if (rawDate) {
      const parts = String(rawDate).trim().split('/')
      if (parts.length === 3) {
        const [m, d, y] = parts
        testDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      } else if (String(rawDate).includes('-')) {
        testDate = String(rawDate).split('T')[0]
      }
    }

    const testType = String(row.Type || row.type || '').toLowerCase()
    const tags = String(row.Tags || row.tags || '').toLowerCase()

    let cmjInches: number | null = null
    let isoForceNkg: number | null = null

    // 1. Countermovement Jump (Jump Height)
    if (testType.includes('countermovement') || row['Jump Height'] !== undefined) {
      const rawJump = Number(row['Jump Height'] || row.jump_height)
      if (!isNaN(rawJump) && rawJump > 0) {
        cmjInches = Number(rawJump.toFixed(2))
      }
    }

    // 2. Isometric Test (Relative Peak Force)
    if (testType.includes('isometric') || row['Relative Peak Force (BW)'] !== undefined) {
      const isExcluded = tags.includes('arm') || tags.includes('single') || tags.includes('bench')
      if (!isExcluded) {
        const rawForce = Number(
          row['Relative Peak Force (BW)'] ||
          row['Relative Peak Force (N/kg)'] ||
          row.relative_peak_force
        )

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

    // Fetch existing record to avoid ON CONFLICT errors
    const { data: existingRecord } = await supabaseAdmin
      .from('performance_metrics')
      .select('id, iso_belt_squat_peak_force, cmj_height_inches')
      .eq('athlete_id', athleteId)
      .eq('test_date', testDate)
      .maybeSingle()

    let error: any = null

    if (existingRecord) {
      const updateData: Record<string, any> = {}
      if (cmjInches !== null) updateData.cmj_height_inches = cmjInches
      if (isoForceNkg !== null) updateData.iso_belt_squat_peak_force = isoForceNkg

      const { error: updateErr } = await supabaseAdmin
        .from('performance_metrics')
        .update(updateData)
        .eq('id', existingRecord.id)

      error = updateErr
    } else {
      const insertData: Record<string, any> = {
        athlete_id: athleteId,
        test_date: testDate,
      }
      if (cmjInches !== null) insertData.cmj_height_inches = cmjInches
      if (isoForceNkg !== null) insertData.iso_belt_squat_peak_force = isoForceNkg

      const { error: insertErr } = await supabaseAdmin
        .from('performance_metrics')
        .insert(insertData)

      error = insertErr
    }

    if (error) {
      errors.push(`Error saving metric for "${rawName}": ${error.message}`)
    } else {
      insertedCount++
    }
  }

  return { success: true, insertedCount, errors }
}