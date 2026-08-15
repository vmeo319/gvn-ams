'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const STORAGE_KEY = 'gvn_workout_location_id'

// "GVN-Coaches" is a pseudo-location for coaches' own historical test data, not a real gym
// — excluded here since it's meaningless as an exercise-naming-convention bucket.
const EXCLUDED_LOCATION_NAMES = ['gvn-coaches']

export interface WorkoutLocationOption {
  id: string
  name: string
}

// Shared "which gym am I building for right now" context for the workout builder — the
// exercise bank and autocomplete are scoped to this. Persisted per-device (localStorage),
// not per-workout, since workouts themselves aren't tied to a location; defaults to the
// coach's own profile location the first time, falling back to the first real gym if that's
// unset or is the GVN-Coaches pseudo-location.
export function useWorkoutLocation() {
  const [locations, setLocations] = useState<WorkoutLocationOption[]>([])
  const [locationId, setLocationIdState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: locRows } = await supabase.from('locations').select('id, name').order('name')
      const realLocations = (locRows || []).filter(
        (l) => !EXCLUDED_LOCATION_NAMES.includes(l.name.trim().toLowerCase())
      )
      setLocations(realLocations)

      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && realLocations.some((l) => l.id === stored)) {
        setLocationIdState(stored)
        setLoaded(true)
        return
      }

      let fallback = realLocations[0]?.id || null
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('location_id').eq('id', user.id).single()
        if (profile?.location_id && realLocations.some((l) => l.id === profile.location_id)) {
          fallback = profile.location_id
        }
      }
      if (fallback) {
        setLocationIdState(fallback)
        localStorage.setItem(STORAGE_KEY, fallback)
      }
      setLoaded(true)
    }
    init()
  }, [])

  function setLocationId(id: string) {
    setLocationIdState(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  return { locations, locationId, setLocationId, loaded }
}
