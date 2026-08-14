'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

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

async function getAppOrigin(): Promise<string> {
  const hdrs = await headers()
  const host = hdrs.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  return `${protocol}://${host}`
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

// Manually invokes the same edge functions the nightly cron jobs call, using the same
// service-role bearer auth (supabase/migrations/20260805030000_fix_cron_jobs.sql) — lets
// an admin force a sync without waiting for the schedule.
export async function triggerManualSyncAction(data: { source: 'sync-hawkins' | 'sync-1080' }) {
  try {
    const body = data.source === 'sync-1080' ? { mode: 'enqueue', lookbackDays: 14 } : {}
    const res = await fetch(`${supabaseUrl}/functions/v1/${data.source}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      return { success: false, error: formatError(json?.error || `HTTP ${res.status}`) }
    }
    return { success: true, result: json }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
