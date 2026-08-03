import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HAWKINS_REFRESH_TOKEN = Deno.env.get('HAWKINS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  try {
    if (!HAWKINS_REFRESH_TOKEN) {
      return new Response('Missing HAWKINS_API_KEY secret', { status: 500 })
    }

    // 1. Get Bearer Access Token from Hawkins Auth
    const authRes = await fetch('https://cloud.hawkindynamics.com/api/token', {
      headers: { 'Authorization': `Bearer ${HAWKINS_REFRESH_TOKEN}` }
    })
    const authData = await authRes.json()
    const accessToken = authData.access_token

    if (!accessToken) {
      return new Response('Failed to generate Hawkins access token', { status: 401 })
    }

    const authHeader = { 'Authorization': `Bearer ${accessToken}` }

    // 2. Fetch Recent Tests (Last 90 Days)
    const ninetyDaysAgoUnix = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60)
    const hawkinsRes = await fetch(`https://cloud.hawkindynamics.com/api/v1?syncFrom=${ninetyDaysAgoUnix}`, { headers: authHeader })

    const hawkinsData = await hawkinsRes.json()
    const tests = hawkinsData.data || hawkinsData.tests || (Array.isArray(hawkinsData) ? hawkinsData : [])

    // Cache existing GVN profiles in memory
    const { data: allProfiles } = await supabase.from('profiles').select('id, first_name, last_name, weight_lbs')
    
    const profileMap = new Map<string, { id: string; weightLbs: number | null }>()
    allProfiles?.forEach(p => {
      if (p.first_name && p.last_name) {
        const key = `${p.first_name.toLowerCase().trim()}_${p.last_name.toLowerCase().trim()}`
        profileMap.set(key, { id: p.id, weightLbs: p.weight_lbs })
      }
    })

    const metricsToInsert: any[] = []
    const profileWeightUpdates = new Map<string, number>()

    for (const test of tests) {
      let firstName = ''
      let lastName = ''

      if (test.athlete && typeof test.athlete === 'object' && test.athlete.name) {
        const parts = String(test.athlete.name).trim().split(/\s+/)
        firstName = parts[0]
        lastName = parts.slice(1).join(' ')
      } else if (test.athlete_name) {
        const parts = String(test.athlete_name).trim().split(/\s+/)
        firstName = parts[0]
        lastName = parts.slice(1).join(' ')
      }

      firstName = firstName.toLowerCase().trim()
      lastName = lastName.toLowerCase().trim()

      if (!firstName || !lastName) continue

      const nameKey = `${firstName}_${lastName}`
      let athleteRecord = profileMap.get(nameKey)

      // Create placeholder profile in memory/DB if missing
      if (!athleteRecord) {
        const cleanFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1)
        const cleanLast = lastName.charAt(0).toUpperCase() + lastName.slice(1)

        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({
            first_name: cleanFirst,
            last_name: cleanLast,
            role: 'athlete'
          })
          .select('id, weight_lbs')
          .single()

        if (newProfile) {
          athleteRecord = { id: newProfile.id, weightLbs: newProfile.weight_lbs }
          profileMap.set(nameKey, athleteRecord)
        }
      }

      if (athleteRecord) {
        let isoPeakForce: number | null = null
        let cmjHeight: number | null = null
        let recordedWeightLbs: number | null = null

        // Scan keys directly on test object
        for (const [key, rawVal] of Object.entries(test)) {
          const val = Number(rawVal)
          if (isNaN(val) || val === null) continue

          const lowerKey = key.toLowerCase()

          // System Weight / Body Weight
          if (lowerKey.includes('system weight') || lowerKey.includes('body weight')) {
            recordedWeightLbs = lowerKey.includes('(n)') ? val * 0.224809 : val
          }

          // Peak Force / ISO Peak Force / Propulsive Force
          if (
            lowerKey.includes('peak propulsive force') ||
            lowerKey.includes('mtp peak force') ||
            lowerKey.includes('iso peak force') ||
            lowerKey.includes('peak force(n)')
          ) {
            isoPeakForce = val
          }

          // Jump Height
          if (
            lowerKey.includes('jump height(m)') ||
            lowerKey.includes('jump height(in)') ||
            lowerKey.includes('jump height')
          ) {
            cmjHeight = lowerKey.includes('(m)') || val < 3.0 ? val * 39.3701 : val
          }
        }

        // Store profile weight update in memory instead of awaiting DB calls in loop
        if (recordedWeightLbs && !athleteRecord.weightLbs) {
          const calcWeight = Number(recordedWeightLbs.toFixed(1))
          profileWeightUpdates.set(athleteRecord.id, calcWeight)
          athleteRecord.weightLbs = calcWeight
        }

        if (isoPeakForce !== null || cmjHeight !== null) {
          let testDate = new Date().toISOString().split('T')[0]
          if (test.timestamp) {
            testDate = new Date(test.timestamp * 1000).toISOString().split('T')[0]
          } else if (test.test_date || test.date) {
            testDate = new Date(test.test_date || test.date).toISOString().split('T')[0]
          }

          metricsToInsert.push({
            athlete_id: athleteRecord.id,
            test_date: testDate,
            iso_belt_squat_peak_force: isoPeakForce ? Number(isoPeakForce.toFixed(2)) : null,
            cmj_height_inches: cmjHeight ? Number(cmjHeight.toFixed(2)) : null,
            weight_lbs: recordedWeightLbs ? Number(recordedWeightLbs.toFixed(1)) : athleteRecord.weightLbs
          })
        }
      }
    }

    // 3. Batch Update Profile Weights
    for (const [athId, weightVal] of profileWeightUpdates.entries()) {
      await supabase.from('profiles').update({ weight_lbs: weightVal }).eq('id', athId)
    }

    // 4. Single Bulk Insert into Supabase (chunks of 500)
    let insertedCount = 0
    if (metricsToInsert.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < metricsToInsert.length; i += chunkSize) {
        const chunk = metricsToInsert.slice(i, i + chunkSize)
        const { error } = await supabase.from('performance_metrics').insert(chunk)
        if (error) console.error('Batch insert error:', error.message)
      }
      insertedCount = metricsToInsert.length
    }

    return new Response(JSON.stringify({ 
      success: true, 
      fetchedHawkinsTests: tests.length,
      updatedProfileWeights: profileWeightUpdates.size,
      insertedMetrics: insertedCount 
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})