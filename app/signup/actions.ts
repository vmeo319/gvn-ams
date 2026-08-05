'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

interface ClaimAccountData {
  firstName: string
  lastName: string
  email: string
  password: string
}

async function hasAuthAccount(id: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  return res.status === 200
}

export async function claimAthleteAccount(data: ClaimAccountData) {
  try {
    const firstName = data.firstName.trim()
    const lastName = data.lastName.trim()
    const email = data.email.trim().toLowerCase()

    if (!firstName || !lastName) {
      return { success: false, error: 'First and last name are required.' }
    }
    if (!email || !data.password) {
      return { success: false, error: 'Email and password are required.' }
    }
    if (data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' }
    }

    const { data: matches, error: matchErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .eq('role', 'athlete')

    if (matchErr) {
      return { success: false, error: 'Could not look up your profile. Please try again shortly.' }
    }

    // Only profiles that don't already have a login are eligible to be claimed.
    const eligible = []
    for (const profile of matches || []) {
      const alreadyClaimed = await hasAuthAccount(profile.id)
      if (!alreadyClaimed) eligible.push(profile)
    }

    if (eligible.length === 0) {
      return {
        success: false,
        error: "We couldn't find an unclaimed profile with that exact name. Double-check the spelling, or ask your coach to look you up.",
      }
    }
    if (eligible.length > 1) {
      return {
        success: false,
        error: 'Found more than one matching profile with that name. Ask your coach to help link your account.',
      }
    }

    const oldProfile = eligible[0]

    // `profiles` has a unique constraint on (first_name, last_name), and creating a new
    // auth user auto-creates a profiles row via a DB trigger using that same name — so the
    // old orphaned row has to be renamed out of the way first or the trigger's insert collides.
    const holdName = `__claiming_${oldProfile.id}`
    const { error: renameErr } = await supabaseAdmin
      .from('profiles')
      .update({ first_name: holdName, last_name: holdName })
      .eq('id', oldProfile.id)

    if (renameErr) {
      return { success: false, error: 'Could not prepare your profile for claiming. Please try again.' }
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.signUp({
      email,
      password: data.password,
      options: {
        data: { first_name: firstName, last_name: lastName },
      },
    })

    if (authErr || !authData?.user) {
      // Roll back the rename so the profile is still findable on a retry.
      await supabaseAdmin
        .from('profiles')
        .update({ first_name: oldProfile.first_name, last_name: oldProfile.last_name })
        .eq('id', oldProfile.id)
      return { success: false, error: authErr?.message || 'Could not create your account. That email may already be in use.' }
    }

    const newUserId = authData.user.id

    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(
      {
        id: newUserId,
        first_name: oldProfile.first_name,
        last_name: oldProfile.last_name,
        role: 'athlete',
        birth_year: oldProfile.birth_year,
        position: oldProfile.position,
        height_inches: oldProfile.height_inches,
        weight_lbs: oldProfile.weight_lbs,
        location_id: oldProfile.location_id,
        tier_level: oldProfile.tier_level,
      },
      { onConflict: 'id' }
    )

    if (profileErr) {
      return { success: false, error: 'Your login was created, but linking your profile failed. Contact your coach.' }
    }

    await supabaseAdmin
      .from('performance_metrics')
      .update({ athlete_id: newUserId })
      .eq('athlete_id', oldProfile.id)

    await supabaseAdmin.from('profiles').delete().eq('id', oldProfile.id)

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Something went wrong. Please try again.' }
  }
}
