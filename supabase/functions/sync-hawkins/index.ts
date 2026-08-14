import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HAWKINS_REFRESH_TOKEN = Deno.env.get('HAWKINS_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// First-name variants that should be treated as the same person (last name must still
// match exactly). Hawkins and the roster don't always agree on which form gets used.
const NICKNAME_GROUPS: string[][] = [
  ['nate', 'nathan', 'nathen', 'nathaniel'],
  ['kenneth', 'kenny', 'ken'],
  ['socrates', 'sam', 'samuel'],
]
const nicknameGroupOf = new Map<string, Set<string>>()
for (const group of NICKNAME_GROUPS) {
  const set = new Set(group)
  for (const name of group) nicknameGroupOf.set(name, set)
}
function firstNamesMatch(a: string, b: string): boolean {
  if (a === b) return true
  const groupA = nicknameGroupOf.get(a)
  return !!groupA && groupA.has(b)
}

Deno.serve(async (req) => {
  try {
    if (!HAWKINS_REFRESH_TOKEN) {
      return new Response('Missing HAWKINS_API_KEY secret', { status: 500 })
    }

    let lookbackDays = 90
    let triggeredBy: 'auto' | 'manual' = 'auto'
    try {
      const body = await req.json()
      if (typeof body?.lookbackDays === 'number') lookbackDays = body.lookbackDays
      if (body?.triggeredBy === 'manual') triggeredBy = 'manual'
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
      .select('id, first_name, last_name')

    const profileMap = new Map<string, { id: string }>()
    const profilesByLastName = new Map<string, { firstName: string; id: string }[]>()
    allProfiles?.forEach((p) => {
      if (p.first_name && p.last_name) {
        const first = p.first_name.toLowerCase().trim()
        const last = p.last_name.toLowerCase().trim()
        profileMap.set(`${first}_${last}`, { id: p.id })
        if (!profilesByLastName.has(last)) profilesByLastName.set(last, [])
        profilesByLastName.get(last)!.push({ firstName: first, id: p.id })
      }
    })

    // Tracks only dates where THIS sync run actually found a fresh reading — never a
    // null placeholder for "not tested today." A batch upsert applies one fixed column
    // list to every row it's given, so if we ever included iso/cmj as null for a date
    // that just had an unrelated bodyweight-only isometric test, the upsert would
    // overwrite that date's real historical value with null on every re-sync. Keeping
    // each metric in its own map (and later its own upsert, with only that metric's
    // column) guarantees a sync can only ever write a column it has real data for.
    const bestIsoBySession = new Map<string, { athleteId: string; testDate: string; value: number }>()
    const bestCmjBySession = new Map<string, { athleteId: string; testDate: string; value: number }>()

    let matchedTestsCount = 0

    // Newtons -> pounds: N / 9.80665 (m/s^2) * 2.20462 (kg->lb) = N * 0.224809
    const N_TO_LBS = 0.224809
    const latestWeightByAthlete = new Map<string, { timestamp: number; weightLbs: number }>()
    // Per-date weight (keyed the same as the session-key maps below) so each
    // performance_metrics row gets the weight actually measured that day, not a single
    // snapshot applied to every row in the run.
    const weightByDate = new Map<string, { timestamp: number; weightLbs: number }>()

    for (const test of tests) {
      // Reps get marked inactive when a coach invalidates a mis-fire or bad attempt in
      // the Hawkins app — including them pulls in bogus outlier readings (both far too
      // high and far too low).
      if (test?.active === false) continue

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

      // Exact match only — a loose "includes('countermovement')" fallback used to also
      // match "Countermovement Jump-training" and "...-SL Land- L/R" variants, inflating
      // the recorded max height above the athlete's real best.
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

      // Any isometric test (not just the belt-squat-45 protocol) reports the athlete's
      // bodyweight via the force plate at test time — used below to keep profiles.weight_lbs
      // current, independent of which specific isometric protocol was run.
      const isAnyIsometric = tClean.startsWith('isometric')

      if (!isPureCMJ && !isAnyIsometric) continue
      if (isPureCMJ || isISOBeltSquat45) matchedTestsCount++

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

      // Trim before splitting — Hawkins has duplicate athlete entries with stray
      // whitespace (e.g. "kenneth Kim "), and splitting an untrimmed string leaves a
      // trailing empty segment that corrupts the parsed last name.
      const parts = fullName.trim().toLowerCase().split(/\s+/)
      const firstName = parts[0]
      const lastName = parts.slice(1).join(' ')

      if (!firstName || !lastName) continue

      const nameKey = `${firstName}_${lastName}`
      let athleteRecord = profileMap.get(nameKey)

      if (!athleteRecord) {
        // Try nickname-equivalent first name against an exact last-name match first —
        // safer than the old "substring both ways" fallback, which could cross-match
        // unrelated people whenever one name happened to contain the other.
        const candidates = profilesByLastName.get(lastName) || []
        const nicknameHit = candidates.find((c) => firstNamesMatch(c.firstName, firstName))
        if (nicknameHit) {
          athleteRecord = { id: nicknameHit.id }
        } else {
          for (const [key, val] of profileMap.entries()) {
            if (key.includes(firstName) && key.includes(lastName)) {
              athleteRecord = val
              break
            }
          }
        }
      }

      if (!athleteRecord) continue

      // Computed here (not just inside the CMJ/ISO block below) since a weight-only
      // isometric test — not CMJ, not ISO-belt-squat-45 — still needs a session key to
      // record that date's weight against.
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

      // The force plate weighs the athlete on every rep, not just isometric ones — CMJ
      // (jump) tests report the same "System Weight(N)" field. Pulling it from both sources
      // gives more frequent weight readings than isometric tests alone, still merged into
      // the one weight_lbs column/graph via weightByDate's per-date latest-wins logic below.
      if ((isAnyIsometric || isPureCMJ) && typeof test.timestamp === 'number') {
        const rawSystemWeightN = Number(test['System Weight(N)'])
        // Floor at ~50lbs (222N) — a mis-fired rep where the athlete wasn't fully
        // settled on the plate yet reports a near-zero system weight (seen as low as 8lbs).
        if (!isNaN(rawSystemWeightN) && rawSystemWeightN > 222) {
          const weightLbs = Number((rawSystemWeightN * N_TO_LBS).toFixed(1))

          const existingWeight = latestWeightByAthlete.get(athleteRecord.id)
          if (!existingWeight || test.timestamp > existingWeight.timestamp) {
            latestWeightByAthlete.set(athleteRecord.id, { timestamp: test.timestamp, weightLbs })
          }

          const existingDateWeight = weightByDate.get(sessionKey)
          if (!existingDateWeight || test.timestamp > existingDateWeight.timestamp) {
            weightByDate.set(sessionKey, { timestamp: test.timestamp, weightLbs })
          }
        }
      }

      if (!isPureCMJ && !isISOBeltSquat45 && !weightByDate.has(sessionKey)) continue

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

      // 4. ISO Belt Squat Force — read the exact canonical field. A prior version cast a
      // wide net across every "force"/"peak"/"rel" key, which very often landed on one of
      // the "Relative Force at N ms (BW)(N/kg)" sub-metrics (e.g. 110-130) instead of the
      // real "Relative Peak Force (BW)(N/kg)" (e.g. 56.7) — explaining values well above
      // the real ~100 N/kg gym record.
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

      if (relForceVal !== null) {
        const value = Number(relForceVal.toFixed(2))
        const existing = bestIsoBySession.get(sessionKey)
        if (!existing || value > existing.value) {
          bestIsoBySession.set(sessionKey, { athleteId: athleteRecord.id, testDate, value })
        }
      }
      if (cmjHeightVal !== null) {
        const value = Number(cmjHeightVal.toFixed(2))
        const existing = bestCmjBySession.get(sessionKey)
        if (!existing || value > existing.value) {
          bestCmjBySession.set(sessionKey, { athleteId: athleteRecord.id, testDate, value })
        }
      }
    }

    const isoRows = Array.from(bestIsoBySession.values()).map((r) => ({
      athlete_id: r.athleteId,
      test_date: r.testDate,
      iso_belt_squat_peak_force: r.value,
    }))
    const cmjRows = Array.from(bestCmjBySession.values()).map((r) => ({
      athlete_id: r.athleteId,
      test_date: r.testDate,
      cmj_height_inches: r.value,
    }))
    const weightRows = Array.from(weightByDate.entries()).map(([sessionKey, w]) => {
      const [athleteId, testDate] = sessionKey.split('_')
      return { athlete_id: athleteId, test_date: testDate, weight_lbs: w.weightLbs }
    })

    const touchedSessions = new Set<string>()
    let insertedCount = 0

    async function upsertRows(rows: Record<string, unknown>[]) {
      const chunkSize = 500
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('performance_metrics')
          .upsert(chunk, { onConflict: 'athlete_id, test_date' })

        if (error) {
          const { error: insertErr } = await supabase.from('performance_metrics').insert(chunk)
          if (insertErr) console.error('Batch insert error:', insertErr.message)
        }
      }
      for (const row of rows) touchedSessions.add(`${row.athlete_id}_${row.test_date}`)
    }

    await upsertRows(isoRows)
    await upsertRows(cmjRows)
    await upsertRows(weightRows)
    insertedCount = touchedSessions.size

    // Autofill profiles.weight_lbs from each athlete's most recent isometric test's
    // measured System Weight(N), converted to pounds.
    let weightsUpdated = 0
    for (const [athleteId, w] of latestWeightByAthlete.entries()) {
      const { error: weightErr } = await supabase
        .from('profiles')
        .update({ weight_lbs: Math.round(w.weightLbs) })
        .eq('id', athleteId)
      if (!weightErr) weightsUpdated++
    }

    // The force plate mis-fires occasionally (an athlete not fully settled, a stray rep) —
    // only skip this when nothing new came in this run, since that's the only thing that
    // could have introduced a fresh outlier.
    let weightOutliersRemoved = 0
    if (weightRows.length > 0) {
      const { data: cleaned, error: cleanErr } = await supabase.rpc('clean_weight_outliers')
      if (!cleanErr && cleaned) weightOutliersRemoved = cleaned.length
    }

    await supabase.from('import_status').upsert(
      { source: 'hawkins', last_imported_at: new Date().toISOString(), triggered_by: triggeredBy, records_count: insertedCount },
      { onConflict: 'source, triggered_by' }
    )

    return new Response(
      JSON.stringify({
        success: true,
        fetchedHawkinsTests: tests.length,
        matchedTestsCount,
        upsertedMetrics: insertedCount,
        weightsUpdated,
        weightOutliersRemoved,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
