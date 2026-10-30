'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

const ASSIGNABLE_ROLES = ['athlete', 'coach', 'admin', 'parent'] as const
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

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

// The `host` header seen by a Server Action isn't reliably the public-facing domain on
// Vercel (confirmed broken — an admin-generated reset link came out pointing at
// localhost:3000 in production). There's exactly one real deployment for this app, so
// hardcoding it removes the whole class of bug instead of trying to detect it correctly;
// the localhost carve-out is what keeps local dev links working during testing.
async function getAppOrigin(): Promise<string> {
  const hdrs = await headers()
  const host = hdrs.get('host') || 'localhost:3000'
  if (host.startsWith('localhost')) return `http://${host}`
  return 'https://gvn-ams.vercel.app'
}

// Brand-new coach login, created straight from an invite — same generateLink + profile
// upsert pattern as upsertAthleteAction's "no existing profile" branch, just with
// role: 'coach'. Returns a link for the admin to copy and send themselves rather than
// setting a plaintext password, matching how every other account invite in this app works.
export async function createCoachAccountAction(data: { firstName: string; lastName: string; email: string }) {
  try {
    const firstName = data.firstName.trim()
    const lastName = data.lastName.trim()
    const email = data.email.trim().toLowerCase()
    if (!firstName || !lastName) return { success: false, error: 'First and last name are required.' }
    if (!email) return { success: false, error: 'Email is required to create a login.' }

    const origin = await getAppOrigin()
    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { first_name: firstName, last_name: lastName },
        redirectTo: `${origin}/invite`,
      },
    })

    if (inviteErr || !inviteData?.user) {
      return { success: false, error: `Invite failed: ${formatError(inviteErr)}` }
    }

    const newUserId = inviteData.user.id
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: newUserId, first_name: firstName, last_name: lastName, role: 'coach', email }, { onConflict: 'id' })
    if (profileErr) return { success: false, error: formatError(profileErr) }

    return {
      success: true,
      inviteLink: inviteData.properties?.action_link,
      message: 'Invite link created — share it with the new coach to activate their account.',
    }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// A recovery link the admin copies and sends themselves (text, email, in person) — same
// "hand back a link, don't email it for them" convention as every invite in this app,
// rather than setting/exposing a plaintext password. Reads the email from the actual auth
// user rather than profiles.email — that column is essentially unpopulated across the
// roster (logins were created via invite links, which never backfilled it), so relying on
// it here would make this silently unusable for almost every real account.
export async function sendPasswordResetLinkAction(data: { userId: string }) {
  try {
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(data.userId)
    const email = authUser?.user?.email
    if (authErr || !email) return { success: false, error: 'This account has no login yet — nothing to reset.' }

    const origin = await getAppOrigin()
    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    })
    if (error || !linkData) return { success: false, error: `Failed to generate link: ${formatError(error)}` }

    return { success: true, resetLink: linkData.properties?.action_link }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// Self-demotion is blocked — the admin page is the only place role changes happen, and
// Vincent is meant to be the sole admin; losing that role from within the same page you'd
// need admin access to undo it from would lock the account out with no UI path back in.
export async function updateUserRoleAction(data: { userId: string; newRole: string; actingAdminId: string }) {
  try {
    if (!ASSIGNABLE_ROLES.includes(data.newRole as AssignableRole)) {
      return { success: false, error: 'Not a valid role.' }
    }
    if (data.userId === data.actingAdminId && data.newRole !== 'admin') {
      return { success: false, error: "You can't remove your own admin access from here." }
    }
    const { error } = await supabaseAdmin.from('profiles').update({ role: data.newRole }).eq('id', data.userId)
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function createLocationAction(data: { name: string }) {
  try {
    const name = data.name.trim()
    if (!name) return { success: false, error: 'Location name is required.' }
    const { error } = await supabaseAdmin.from('locations').insert({ name })
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function renameLocationAction(data: { id: string; name: string }) {
  try {
    const name = data.name.trim()
    if (!name) return { success: false, error: 'Location name is required.' }
    const { error } = await supabaseAdmin.from('locations').update({ name }).eq('id', data.id)
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

export async function deleteLocationAction(data: { id: string }) {
  try {
    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', data.id)
    if (count && count > 0) {
      return { success: false, error: `${count} profile(s) still use this location — reassign them first.` }
    }
    const { error } = await supabaseAdmin.from('locations').delete().eq('id', data.id)
    if (error) return { success: false, error: formatError(error) }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// Replaces the full set of extra locations an athlete trains at, and keeps
// profiles.location_id (their primary location — still what dashboard filtering, the
// leaderboard view, and report cards read) in sync as the first one selected, so existing
// single-location features keep showing something sensible without needing their own changes.
export async function updateProfileLocationsAction(data: { profileId: string; locationIds: string[] }) {
  try {
    // Diffed, not delete-all-then-insert: a DB trigger re-syncs group membership on every
    // athlete_locations change, and a transient "no extra locations" state would drop the
    // athlete out of coach-made groups at locations they're actually keeping.
    const { data: currentRows, error: readErr } = await supabaseAdmin
      .from('athlete_locations')
      .select('location_id')
      .eq('profile_id', data.profileId)
    if (readErr) return { success: false, error: formatError(readErr) }
    const current = new Set((currentRows || []).map((r) => r.location_id))
    const toAdd = data.locationIds.filter((id) => !current.has(id))
    const toRemove = [...current].filter((id) => !data.locationIds.includes(id))

    if (toAdd.length > 0) {
      const { error: insertErr } = await supabaseAdmin
        .from('athlete_locations')
        .insert(toAdd.map((locationId) => ({ profile_id: data.profileId, location_id: locationId })))
      if (insertErr) return { success: false, error: formatError(insertErr) }
    }
    if (toRemove.length > 0) {
      const { error: deleteErr } = await supabaseAdmin
        .from('athlete_locations')
        .delete()
        .eq('profile_id', data.profileId)
        .in('location_id', toRemove)
      if (deleteErr) return { success: false, error: formatError(deleteErr) }
    }

    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update({ location_id: data.locationIds[0] ?? null })
      .eq('id', data.profileId)
    if (profileErr) return { success: false, error: formatError(profileErr) }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// The signed-in admin, read from the request's session cookie. Login and delete actions
// check this themselves rather than trusting an id sent from the browser: a Server Action
// can be called directly, not only from the /admin page the proxy guards.
async function requireAdmin(): Promise<{ id: string } | { error: string }> {
  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Only an admin can do this.' }
  return { id: user.id }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

// Sets the email (login username) and/or password on an existing account. Imported athletes
// already have a login with a placeholder email (@gvn-placeholder.com) and a throwaway
// password; this swaps in real ones. A profile with no login at all gets one created with
// the profile's own id, so all of its existing data stays attached.
export async function setAccountLoginAction(data: { userId: string; email?: string; password?: string }) {
  try {
    const admin = await requireAdmin()
    if ('error' in admin) return { success: false, error: admin.error }

    const email = data.email?.trim().toLowerCase() || ''
    const password = data.password || ''
    if (!email && !password) return { success: false, error: 'Enter a new email, a new password, or both.' }
    if (email && !EMAIL_RE.test(email)) return { success: false, error: 'That email doesn’t look valid.' }
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
    }

    const { data: existing } = await supabaseAdmin.auth.admin.getUserById(data.userId)
    if (existing?.user) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ...(email ? { email, email_confirm: true } : {}),
        ...(password ? { password } : {}),
      })
      if (error) return { success: false, error: formatError(error) }
    } else {
      if (!email || !password) return { success: false, error: 'This account has no login yet — enter both an email and a password.' }
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        id: data.userId,
        email,
        password,
        email_confirm: true,
      })
      if (error) return { success: false, error: formatError(error) }
      // Never leave a login detached from its profile.
      if (created?.user && created.user.id !== data.userId) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id)
        return { success: false, error: 'Could not attach a login to this profile.' }
      }
    }

    if (email) await supabaseAdmin.from('profiles').update({ email }).eq('id', data.userId)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}

// What deleting an account would take with it, shown before the admin confirms.
export async function getAccountDataSummaryAction(data: { userId: string }) {
  const admin = await requireAdmin()
  if ('error' in admin) return { success: false, error: admin.error, testDays: 0, groups: 0, notes: 0, hasLogin: false, email: '' }
  const count = async (table: string, col = 'athlete_id') => {
    const { count: n } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).eq(col, data.userId)
    return n || 0
  }
  const [testDays, groups, notes, authRes] = await Promise.all([
    count('performance_metrics'),
    count('athlete_groups'),
    count('athlete_notes'),
    supabaseAdmin.auth.admin.getUserById(data.userId),
  ])
  const email = authRes.data?.user?.email || ''
  return { success: true, testDays, groups, notes, hasLogin: !!authRes.data?.user, email }
}

// Deletes an account. With mergeIntoId, everything the account owns (test results, groups,
// notes, 1080 sessions...) first moves onto that account -- the way to clean up a duplicate.
// Without it, the account's data is deleted with it.
export async function deleteAccountAction(data: { userId: string; mergeIntoId?: string }) {
  try {
    const admin = await requireAdmin()
    if ('error' in admin) return { success: false, error: admin.error }
    if (data.userId === admin.id) return { success: false, error: 'You can’t delete your own account.' }

    const { data: target } = await supabaseAdmin.from('profiles').select('role').eq('id', data.userId).single()
    if (target?.role === 'admin') return { success: false, error: 'Admin accounts can’t be deleted here.' }

    let merged: { moved: number; dropped: number } | null = null
    if (data.mergeIntoId) {
      const { data: result, error } = await supabaseAdmin.rpc('merge_profile_into', {
        p_from: data.userId,
        p_into: data.mergeIntoId,
      })
      if (error) return { success: false, error: `Merge failed, nothing was deleted: ${formatError(error)}` }
      merged = result as { moved: number; dropped: number }
    }

    const { error: profileErr } = await supabaseAdmin.from('profiles').delete().eq('id', data.userId)
    if (profileErr) return { success: false, error: formatError(profileErr) }

    // Not every profile has a login (some came only from imported test data).
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId)
    if (authUser?.user) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId)
      if (authErr) return { success: false, error: `Profile deleted, but its login could not be: ${formatError(authErr)}` }
    }

    return { success: true, merged }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
