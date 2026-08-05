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

    let lookbackDays = 90
    try {
      const body = await req.json()
      if (typeof body?.lookbackDays === 'number') lookbackDays = body.lookbackDays
    } catch (_) {
      // Body empty or not JSON — default to 90 days for the steady-state nightly sync.
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

    // 2. Fetch tests since the lookback window (defaults to 90 days; pass a larger
    // lookbackDays for a one-time historical backfill)
    const lookbackUnix = Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60
    const hawkinsRes = await fetch(
      `https://cloud.hawkindynamics.com/api/v1?syncFrom=${lookbackUnix}`,
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

      // Exact match only — the loose "includes('countermovement')" fallback this used to
      // have also matched "Countermovement Jump-training" and "...-SL Land- L/R" variants,
      // inflating the recorded max height above the athlete's real best.
      const isPureCMJ = tClean === 'countermovement jump'

      // Hawkins encodes the test's tag both as a nested testType.tags[].name AND baked into
      // the compound testType.name ("Isometric Test-ISO Belt Squat - 45"). Match on the tag
      // specifically — untagged "Isometric Test" and other protocols (Mid-Thigh Pull, etc.)
      // must NOT be included, since they use a different body position and aren't comparable.
      const isoTags: string[] = Array.isArray(test?.testType?.tags)
        ? test.testType.tags.map((t: any) => String(t?.name || '').trim().toLowerCase())
        : []
      const isISOBeltSquat45 =
        isoTags.includes('iso belt squat - 45') || tClean === 'isometric test-iso belt squat - 45'

      if (!isPureCMJ && !isISOBeltSquat45) continue
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

      // 3. CMJ Jump Height — Hawkins reports this in meters as "Jump Height(m)".
      if (isPureCMJ) {
        const rawJumpMeters = Number(test['Jump Height(m)'])
        if (!isNaN(rawJumpMeters) && rawJumpMeters > 0) {
          cmjHeightVal = rawJumpMeters * 39.3701
        } else {
          // Fallback for any differently-shaped payload variant.
          const rawJump = Number(test['Jump Height'] ?? test['Jump Height(in)'] ?? test.jump_height ?? test.jumpHeight)
          if (!isNaN(rawJump) && rawJump > 0) {
            cmjHeightVal = rawJump < 3.0 ? rawJump * 39.3701 : rawJump
          }
        }
      }

      // 4. ISO Belt Squat Force — read the exact canonical field. The old "cast a wide
      // net" scan picked up whichever "force"/"peak"/"rel" key happened to enumerate
      // first, which was very often one of the "Relative Force at N ms (BW)(N/kg)"
      // sub-metrics (e.g. 110-130) instead of the real "Relative Peak Force (BW)(N/kg)"
      // (e.g. 56.7) — explaining values well above the real ~100 N/kg gym record.
      if (isISOBeltSquat45) {
        const rawForce = Number(
          test['Relative Peak Force (BW)(N/kg)'] ??
            test['Relative Peak Force(BW)(N/kg)'] ??
            test['Relative Peak Force (BW) (N/kg)']
        )
        if (!isNaN(rawForce) && rawForce > 0) {
          relForceVal = rawForce
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