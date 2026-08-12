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

async function hasAuthAccount(id: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  })
  return res.status === 200
}

// Athletes a coach already added to the roster who haven't claimed a login yet — candidates
// for linking a pending signup request to, in case the requester's typed name is close but
// not exact, or the coach just wants to confirm the match themselves.
export async function searchUnclaimedAthletes(query: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, location_id')
    .eq('role', 'athlete')

  if (error) return { success: false, error: formatError(error), results: [] }

  // Matched against the combined "First Last" name, not each column separately — a query
  // like "George Golden" won't appear as a substring of either "George" or "Golden" alone.
  const needle = query.trim().toLowerCase()
  const candidates = (data || []).filter((p) =>
    `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(needle)
  )

  const unclaimed = []
  for (const profile of candidates) {
    const claimed = await hasAuthAccount(profile.id)
    if (!claimed) unclaimed.push(profile)
    if (unclaimed.length >= 20) break
  }
  return { success: true, results: unclaimed }
}

// Approves a pending signup request. If linkToExistingProfileId is given, the pending
// account (which already has a real login) takes over that existing unclaimed athlete
// profile's roster data and history; the old orphan row is deleted first to free up the
// (name, role) slot before the pending row claims it as role='athlete', avoiding a
// unique_name_per_role collision. Otherwise the pending row simply becomes a new athlete.
export async function approveSignupRequest(data: { pendingProfileId: string; linkToExistingProfileId?: string }) {
  try {
    if (data.linkToExistingProfileId) {
      const { data: oldProfile, error: oldErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', data.linkToExistingProfileId)
        .single()
      if (oldErr || !oldProfile) return { success: false, error: 'Could not find that athlete profile.' }

      await supabaseAdmin
        .from('performance_metrics')
        .update({ athlete_id: data.pendingProfileId })
        .eq('athlete_id', oldProfile.id)

      const { error: deleteErr } = await supabaseAdmin.from('profiles').delete().eq('id', oldProfile.id)
      if (deleteErr) return { success: false, error: formatError(deleteErr) }

      const { error: updateErr } = await supabaseAdmin
        .from('profiles')
        .update({
          role: 'athlete',
          first_name: oldProfile.first_name,
          last_name: oldProfile.last_name,
          birth_year: oldProfile.birth_year,
          position: oldProfile.position,
          height_inches: oldProfile.height_inches,
          weight_lbs: oldProfile.weight_lbs,
          location_id: oldProfile.location_id,
          tier_level: oldProfile.tier_level,
        })
        .eq('id', data.pendingProfileId)
      if (updateErr) return { success: false, error: formatError(updateErr) }

      return { success: true }
    }

    const { error } = await supabaseAdmin.from('profiles').update({ role: 'athlete' }).eq('id', data.pendingProfileId)
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function denySignupRequest(data: { pendingProfileId: string }) {
  try {
    await supabaseAdmin.auth.admin.deleteUser(data.pendingProfileId)
    const { error } = await supabaseAdmin.from('profiles').delete().eq('id', data.pendingProfileId)
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
