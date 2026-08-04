import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HAWKINS_REFRESH_TOKEN = Deno.env.get('HAWKINS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async () => {
  try {
    if (!HAWKINS_REFRESH_TOKEN) {
      return new Response('Missing HAWKINS_API_KEY secret', { status: 500 })
    }

    // 1. Get Access Token
    const authRes = await fetch('https://cloud.hawkindynamics.com/api/token', {
      headers: { Authorization: `Bearer ${HAWKINS_REFRESH_TOKEN}` },
    })
    const authData = await authRes.json()
    const accessToken = authData.access_token

    if (!accessToken) {
      return new Response('Failed token', { status: 401 })
    }

    // 2. Fetch 90 days of tests
    const ninetyDaysAgoUnix = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60
    const hawkinsRes = await fetch(
      `https://cloud.hawkindynamics.com/api/v1?syncFrom=${ninetyDaysAgoUnix}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    const hawkinsData = await hawkinsRes.json()
    const tests =
      hawkinsData.data ||
      hawkinsData.tests ||
      (Array.isArray(hawkinsData) ? hawkinsData : [])

    // 3. Load profiles
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, weight_lbs')

    const profileMap = new Map<string, { id: string; weightLbs: number | null }>()
    allProfiles?.forEach((p) => {
      if (p.first_name && p.last_name) {
        const key = `${p.first_name.toLowerCase().trim()}_${p.last_name.toLowerCase().trim()}`
        profileMap.set(key, { id: p.id, weightLbs: p.weight_lbs })
      }
    })

    const aggregatedMetrics = new Map<
      string,
      {
        athlete_id: string
        test_date: string
        iso_belt_squat_peak_force: number | null
        cmj_height_inches: number | null
        weight_lbs: number | null
      }
    >()

    let matchedTestsCount = 0

    for (const test of tests) {
      // 1. Test Type
      let rawTypeName = ''
      if (test.testType && typeof test.testType === 'object' && test.testType.name) {
        rawTypeName = String(test.testType.name)
      } else if (typeof test.test_type === 'string') {
        rawTypeName = test.test_type
      } else if (typeof test.Type === 'string') {
        rawTypeName = test.Type
      }

      const tClean = rawTypeName.trim().toLowerCase()

      // Exclude non-target movements
      if (
        tClean.includes('arm swing') ||
        tClean.includes('armswing') ||
        tClean.includes('training') ||
        tClean.includes('barefoot') ||
        tClean.includes('single leg') ||
        tClean.includes('multi-hop')
      ) {
        continue
      }

      const isPureCMJ =
        tClean === 'countermovement jump' ||
        tClean === 'cmj' ||
        (tClean.includes('countermovement') && !tClean.includes('single'))

      const isISO = tClean.includes('isometric') || tClean.includes('iso') || tClean.includes('belt')

      if (!isPureCMJ && !isISO) continue
      matchedTestsCount++

      // 2. Athlete Name
      let fullName = ''
      if (test.athlete && typeof test.athlete === 'object') {
        fullName = String(test.athlete.name || '').trim()
      } else if (test.athlete_name) {
        fullName = String(test.athlete_name).trim()
      } else if (test.Name) {
        fullName = String(test.Name).trim()
      }

      if (!fullName) continue

      const parts = fullName.toLowerCase().split(/\s+/)
      const firstName = parts[0]
      const lastName = parts.slice(1).join(' ')

      if (!firstName || !lastName) continue

      const nameKey = `${firstName}_${lastName}`
      let athleteRecord = profileMap.get(nameKey)

      if (!athleteRecord) {
        for (const [key, val] of profileMap.entries()) {
          if (key.includes(firstName) && key.includes(lastName)) {
            athleteRecord = val
            break
          }
        }
      }

      if (!athleteRecord) continue

      let relForceVal: number | null = null
      let cmjHeightVal: number | null = null

      // 3. CMJ Jump Height
      if (isPureCMJ) {
        const rawJump = Number(
          test['Jump Height'] ||
            test['Jump Height(in)'] ||
            test['Jump Height(m)'] ||
            test.jump_height ||
            test.jumpHeight ||
            (test.metrics && (test.metrics.jump_height || test.metrics.jumpHeight))
        )
        if (!isNaN(rawJump) && rawJump > 0) {
          cmjHeightVal = rawJump < 3.0 ? rawJump * 39.3701 : rawJump
        }
      }

      // 4. ISO Belt Squat Force Extraction (Cast a wide net across all keys)
      if (isISO) {
        const flattened = { ...test, ...(test.metrics || {}) }

        for (const [k, v] of Object.entries(flattened)) {
          const kLower = k.toLowerCase()
          const valNum = Number(v)
          if (isNaN(valNum) || valNum <= 0) continue

          // Look for any force key
          if (kLower.includes('force') || kLower.includes('peak') || kLower.includes('rel')) {
            if (kLower.includes('weight') || kLower.includes('timestamp') || kLower === 'id') continue

            // Normalize value directly to standard N/kg (30 - 100 range)
            if (valNum >= 15.0 && valNum <= 150.0) {
              relForceVal = valNum
            } else if (valNum < 2.0) {
              relForceVal = valNum * 98.0665
            } else if (valNum < 15.0) {
              relForceVal = valNum * 9.80665
            }

            if (relForceVal !== null) break
          }
        }
      }

      if (relForceVal !== null || cmjHeightVal !== null) {
        let testDate = new Date().toISOString().split('T')[0]
        if (test.timestamp) {
          testDate = new Date(test.timestamp * 1000).toISOString().split('T')[0]
        } else if (test.test_date || test.date || test.Date) {
          const rawD = test.test_date || test.date || test.Date
          if (typeof rawD === 'string' && rawD.includes('/')) {
            const [m, d, y] = rawD.split('/')
            testDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          } else {
            testDate = new Date(rawD).toISOString().split('T')[0]
          }
        }

        const sessionKey = `${athleteRecord.id}_${testDate}`
        const existing = aggregatedMetrics.get(sessionKey)

        const bestForce = Math.max(
          existing?.iso_belt_squat_peak_force || 0,
          relForceVal ? Number(relForceVal.toFixed(2)) : 0
        )
        const bestCMJ = Math.max(
          existing?.cmj_height_inches || 0,
          cmjHeightVal ? Number(cmjHeightVal.toFixed(2)) : 0
        )

        aggregatedMetrics.set(sessionKey, {
          athlete_id: athleteRecord.id,
          test_date: testDate,
          iso_belt_squat_peak_force: bestForce > 0 ? bestForce : null,
          cmj_height_inches: bestCMJ > 0 ? bestCMJ : null,
          weight_lbs: athleteRecord.weightLbs,
        })
      }
    }

    const metricsToInsert = Array.from(aggregatedMetrics.values())
    let insertedCount = 0

    if (metricsToInsert.length > 0) {
      const chunkSize = 500
      for (let i = 0; i < metricsToInsert.length; i += chunkSize) {
        const chunk = metricsToInsert.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('performance_metrics')
          .upsert(chunk, { onConflict: 'athlete_id, test_date' })

        if (error) {
          const { error: insertErr } = await supabase.from('performance_metrics').insert(chunk)
          if (insertErr) console.error('Batch insert error:', insertErr.message)
        }
      }
      insertedCount = metricsToInsert.length
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetchedHawkinsTests: tests.length,
        matchedTestsCount,
        upsertedMetrics: insertedCount,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})