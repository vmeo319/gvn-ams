'use server'

import { createClient } from '@supabase/supabase-js'

// Initialize a elevated Supabase client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

export async function createAthleteAction(data: NewAthleteData) {
  try {
    // 1. Create the Auth User in Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
        }
      }
    })

    if (authError) return { success: false, error: authError.message }
    if (!authData.user) return { success: false, error: 'User creation failed.' }

    const userId = authData.user.id

    // 2. Insert or Update their Profile details
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        first_name: data.firstName,
        last_name: data.lastName,
        birth_year: data.birthYear,
        position: data.position,
        height_inches: data.heightInches,
        weight_lbs: data.weightLbs,
        role: 'athlete'
      })

    if (profileError) return { success: false, error: profileError.message }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected error occurred.' }
  }
}