'use server'

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase Admin Client using Service Role Key
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
}

/**
 * 1. ACTION: Create New Athlete Profile (with Duplicate Name Check)
 */
export async function createAthleteAction(data: NewAthleteData) {
  try {
    const cleanEmail = data.email.trim().toLowerCase()
    const cleanFirstName = data.firstName.trim()
    const cleanLastName = data.lastName.trim()

    // 1A. Prevent duplicate athlete profiles by checking First Name + Last Name
    const { data: existingAthlete } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('first_name', cleanFirstName)
      .ilike('last_name', cleanLastName)
      .maybeSingle()

    if (existingAthlete) {
      return { 
        success: false, 
        error: `An athlete named "${cleanFirstName} ${cleanLastName}" already exists. Please check the name or add a middle initial.` 
      }
    }

    // 1B. Create Auth User via Admin API (bypasses domain restrictions & email verification)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: cleanFirstName,
        last_name: cleanLastName,
      }
    })

    if (authError) return { success: false, error: authError.message }
    if (!authData.user) return { success: false, error: 'User creation failed.' }

    const userId = authData.user.id

    // 1C. Insert or update Profile record
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        birth_year: data.birthYear,
        position: data.position,
        height_inches: data.heightInches,
        weight_lbs: data.weightLbs,
        role: 'athlete'
      }, { onConflict: 'id' })

    if (profileError) return { success: false, error: profileError.message }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected error occurred.' }
  }
}

/**
 * 2. ACTION: Parse & Ingest Metric Rows (Excel / Hawkins / 1080)
 */
export async function uploadMetricRows(rows: any[]) {
  let insertedCount = 0
  let errors: string[] = []

  for (const row of rows) {
    // Standardize column header lookups by First Name + Last Name
    const firstName = (row.first_name || row['First Name'] || row.firstname || '').toString().trim()
    const lastName = (row.last_name || row['Last Name'] || row.lastname || '').toString().trim()

    if (!firstName || !lastName) {
      errors.push(`Skipped row: Missing first name or last name.`)
      continue
    }

    // Match athlete strictly by First Name + Last Name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .maybeSingle()

    if (!profile) {
      errors.push(`Athlete "${firstName} ${lastName}" not found in GVN AMS. Create profile first.`)
      continue
    }

    // Parse metric entries dynamically
    const testDate = row.test_date || row['Test Date'] || new Date().toISOString().split('T')[0]
    const isoPeakForce = row.iso_peak_force_n || row['ISO Peak Force (N)']
    const v0Speed = row.v0_speed || row['V0 Speed']
    const cmjHeight = row.cmj_height_in || row['CMJ Height (in)']
    const broadJump = row.broad_jump_in || row['Broad Jump (in)']
    const benchVelo = row.bench_velo_ms || row['Bench Velo (m/s)']
    const chinUps = row.chin_ups || row['Chin-ups']
    const weightLbs = row.weight_lbs || row['Weight (lbs)']

    // Insert into performance_metrics
    const { error } = await supabaseAdmin.from('performance_metrics').insert({
      athlete_id: profile.id,
      test_date: testDate,
      iso_belt_squat_peak_force: isoPeakForce ? Number(isoPeakForce) : null,
      v0_speed: v0Speed ? Number(v0Speed) : null,
      cmj_height_inches: cmjHeight ? Number(cmjHeight) : null,
      broad_jump_inches: broadJump ? Number(broadJump) : null,
      bench_velo_ms: benchVelo ? Number(benchVelo) : null,
      chin_ups: chinUps ? Number(chinUps) : null,
      weight_lbs: weightLbs ? Number(weightLbs) : null,
    })

    if (error) {
      errors.push(`Error saving metrics for ${firstName} ${lastName}: ${error.message}`)
    } else {
      insertedCount++
    }
  }

  return { success: true, insertedCount, errors }
}