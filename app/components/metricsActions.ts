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

// Shared between the athlete's own dashboard and the coach's per-athlete view — both can
// log a manual weight entry. Payload only ever carries these three keys, so an upsert
// conflict on an existing test_date row never touches that date's iso/cmj/top_speed values.
export async function logManualWeight(data: { athleteId: string; weightLbs: number; testDate?: string }) {
  const testDate = data.testDate || new Date().toISOString().split('T')[0]
  const { error } = await supabaseAdmin
    .from('performance_metrics')
    .upsert(
      { athlete_id: data.athleteId, test_date: testDate, weight_lbs: data.weightLbs },
      { onConflict: 'athlete_id, test_date' }
    )
  if (error) return { success: false, error: formatError(error) }
  return { success: true }
}
