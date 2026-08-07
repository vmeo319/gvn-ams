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
  return 'Something went wrong.'
}

export async function getParentInviteInfoAction(token: string) {
  const { data: invite, error } = await supabaseAdmin
    .from('parent_invites')
    .select('status, expires_at, athlete_id')
    .eq('token', token)
    .maybeSingle()

  if (error || !invite) return { success: false, error: 'Invite not found.' }

  let status: string = invite.status
  if (status === 'pending' && new Date(invite.expires_at) < new Date()) status = 'expired'

  const { data: athlete } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', invite.athlete_id)
    .maybeSingle()

  return {
    success: true,
    status,
    athleteName: athlete ? `${athlete.first_name || ''} ${athlete.last_name || ''}`.trim() : 'this athlete',
  }
}

// Claims a parent invite either against an already-signed-in session (accessToken) or by
// creating a brand-new parent account (newAccount). Either way the invite's athlete_id gets
// linked to whichever user ends up owning this claim, and the same parent can repeat this
// flow for a second child's invite without colliding with their existing account — unlike
// Supabase's admin.generateLink({type:'invite'}), which provisions a new auth user at
// generation time and only supports a single one-time claim.
export async function claimParentInviteAction(params: {
  token: string
  accessToken?: string
  newAccount?: { firstName: string; lastName: string; email: string; password: string }
}) {
  try {
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('parent_invites')
      .select('*')
      .eq('token', params.token)
      .maybeSingle()

    if (inviteErr || !invite) return { success: false, error: 'Invite not found.' }
    if (invite.status !== 'pending') return { success: false, error: 'This invite has already been used or revoked.' }
    if (new Date(invite.expires_at) < new Date()) return { success: false, error: 'This invite has expired.' }

    let userId: string
    let sessionCreds: { email: string; password: string } | null = null

    if (params.accessToken) {
      // Real identity verification (the one deliberate exception to this app's usual
      // trust-the-client convention for writes) — this determines who gets ongoing
      // read access to a minor's data.
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(params.accessToken)
      if (userErr || !userData?.user) return { success: false, error: 'Could not verify your session — please sign in again.' }
      userId = userData.user.id
    } else if (params.newAccount) {
      const cleanFirst = params.newAccount.firstName.trim()
      const cleanLast = params.newAccount.lastName.trim()
      const cleanEmail = params.newAccount.email.trim().toLowerCase()
      const password = params.newAccount.password
      if (!cleanFirst || !cleanLast || !cleanEmail || !password) {
        return { success: false, error: 'All fields are required.' }
      }
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { first_name: cleanFirst, last_name: cleanLast },
      })
      if (createErr || !created?.user) return { success: false, error: formatError(createErr) }
      userId = created.user.id
      sessionCreds = { email: cleanEmail, password }
    } else {
      return { success: false, error: 'Missing session or account details.' }
    }

    // The DB trigger auto-creates a profiles row on new auth users with a default role —
    // for a brand-new account (params.newAccount) that default is meaningless noise we're
    // about to overwrite below, not a real identity conflict, so the coach/admin/athlete
    // rejection only applies when resolving an *existing* session (accessToken branch),
    // where the role reflects a real pre-existing account the parent is trying to reuse.
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (!params.newAccount && existingProfile && ['coach', 'admin', 'athlete'].includes(existingProfile.role)) {
      return {
        success: false,
        error: `This login is already a ${existingProfile.role} account — parent linking needs a dedicated account.`,
      }
    }

    if (params.newAccount) {
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(
        {
          id: userId,
          first_name: params.newAccount.firstName.trim(),
          last_name: params.newAccount.lastName.trim(),
          role: 'parent',
        },
        { onConflict: 'id' }
      )
      if (profileErr) {
        if (String(profileErr.message || '').includes('unique_name_per_role')) {
          return {
            success: false,
            error: 'A parent account with this exact name already exists — try adding a middle initial, or contact the coach.',
          }
        }
        return { success: false, error: formatError(profileErr) }
      }
    } else if (!existingProfile) {
      return { success: false, error: 'Could not find your profile.' }
    } else if (existingProfile.role !== 'parent') {
      await supabaseAdmin.from('profiles').update({ role: 'parent' }).eq('id', userId)
    }

    const { error: linkErr } = await supabaseAdmin
      .from('parent_athlete_links')
      .upsert({ parent_id: userId, athlete_id: invite.athlete_id }, { onConflict: 'parent_id, athlete_id', ignoreDuplicates: true })
    if (linkErr) return { success: false, error: formatError(linkErr) }

    await supabaseAdmin
      .from('parent_invites')
      .update({ status: 'claimed', claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq('token', params.token)

    return { success: true, session: sessionCreds }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
