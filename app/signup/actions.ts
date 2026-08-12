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

interface RequestAccountData {
  firstName: string
  lastName: string
  email: string
  password: string
}

// Every self-serve signup now lands in a coach review queue (profiles.role = 'pending')
// instead of being claimed instantly, even when the name exactly matches an existing
// unclaimed athlete profile — a coach explicitly links or creates the profile on approval.
export async function requestAccount(data: RequestAccountData) {
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

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })

    if (createErr || !created?.user) {
      return { success: false, error: formatError(createErr) || 'Could not create your account. That email may already be in use.' }
    }

    const { error: profileErr } = await supabaseAdmin.from('profiles').upsert(
      { id: created.user.id, first_name: firstName, last_name: lastName, role: 'pending', email },
      { onConflict: 'id' }
    )

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return { success: false, error: formatError(profileErr) }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatError(err) }
  }
}
