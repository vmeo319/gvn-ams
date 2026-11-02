import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-1080-api-key',
}

// Real 1080 Motion public API shape, confirmed against the live API and the official
// sample client (github.com/1080Motion/API/Samples/webapi-dotnet):
//   GET /Client                              -> PublicClient[]
//   GET /Session?maxAgeDays=N                -> SessionInfo[] { id, timestamp, clientId } (this
//                                                param is honored; the previously-used
//                                                /Session/Search endpoint ignores every filter
//                                                param including `take`, and always returns the
//                                                full org-wide session history)
//   GET /Session/{id}                        -> PublicSession { id, created, clientId, exercises }
//                                                exercises[].sets[] here is a lightweight stub
//                                                (externalLoad always 0) — NOT the real per-rep data
//   GET /TrainingData/Set/{setId}?includeSamples=false
//                                             -> PublicSetData { motionGroups[].motions[] }, each
//                                                motion has resistanceValues.concentricLoad (kg),
//                                                topSpeed / peakValues.speed (m/s), and
//                                                totalDistance (m) — confirmed via a real
//                                                "10yd Off-Ice Sprint" motion: totalDistance
//                                                9.144, which is exactly 10 yards.
const API_BASE = "https://publicapi.1080motion.com"

const MPS_TO_MPH = 2.23694
const LOAD_TOLERANCE_KG = 0.5 // "2kg" sprints in practice land at 1.5-2.5

// Coaches sometimes run a 15-yard sprint under the same "10yd Off-Ice Sprint" exercise
// template — the label is wrong but the distance actually covered is real (13.716m, not
// 9.144m), which inflates top_speed since the athlete keeps accelerating over the extra 5
// yards. totalDistance is the ground truth regardless of what the exercise is labeled;
// anything not within tolerance of a genuine 10-yard rep is excluded rather than trusted.
const TEN_YARD_METERS = 9.144
const DISTANCE_TOLERANCE_M = 0.6 // a real 15yd rep (13.716m) misses this by ~4.6m — nowhere close

// First-name variants that should be treated as the same person (last name must still
// match exactly). 1080 and the roster don't always agree on which form gets used.
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

function isOffIceSprintProfiling(name: string) {
  return name.trim().toLowerCase() === "off-ice sprint profiling"
}
function isTenYardOffIceSprint(name: string) {
  return name.trim().toLowerCase() === "10yd off-ice sprint"
}

// "On-Ice Sprint Profile": 2 kg resisted skating sprints, run as 15-yard and 30-yard reps
// since late 2025 (earlier sessions used 12/22/25 yards, which aren't comparable and are
// skipped). Top speed comes from 30-yard reps only, since 15-yard reps end before top speed.
function isOnIceSprintProfile(name: string) {
  return name.trim().toLowerCase() === "on-ice sprint profile"
}
const FIFTEEN_YARD_METERS = 13.716
const THIRTY_YARD_METERS = 27.432

type OnIce = { topSpeedMph: number | null; accelMax: number | null; time15: number | null }

async function onIceFromSession(sessionDetail: any, headers: Record<string, string>): Promise<OnIce | null> {
  let topSpeedMps = 0
  let accelMax = 0
  let time15 = Infinity
  let found = false
  for (const ex of sessionDetail?.exercises || []) {
    if (!isOnIceSprintProfile(ex?.exerciseTypeName || ex?.name || "")) continue
    for (const setRef of ex?.sets || []) {
      if (!setRef?.id) continue
      const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=false`, { headers })
      if (!setRes.ok) continue
      const setData = await setRes.json()
      for (const mg of setData?.motionGroups || []) {
        for (const motion of mg?.motions || []) {
          const loadKg = Number(motion?.resistanceValues?.concentricLoad)
          const distance = Number(motion?.totalDistance)
          if (isNaN(loadKg) || Math.abs(loadKg - 2) > LOAD_TOLERANCE_KG) continue
          const is15 = Math.abs(distance - FIFTEEN_YARD_METERS) <= DISTANCE_TOLERANCE_M
          const is30 = Math.abs(distance - THIRTY_YARD_METERS) <= DISTANCE_TOLERANCE_M
          if (!is15 && !is30) continue
          found = true
          const speed = Number(motion?.topSpeed)
          const accel = Number(motion?.accelDecelStats?.accelerationMax)
          const time = Number(motion?.totalTime)
          if (is30 && speed > topSpeedMps) topSpeedMps = speed
          if (accel > accelMax) accelMax = accel
          if (is15 && time > 0 && time < time15) time15 = time
        }
      }
    }
  }
  if (!found) return null
  return {
    topSpeedMph: topSpeedMps > 0 ? Number((topSpeedMps * MPS_TO_MPH).toFixed(2)) : null,
    accelMax: accelMax > 0 ? Number(accelMax.toFixed(2)) : null,
    time15: isFinite(time15) ? Number(time15.toFixed(2)) : null,
  }
}

// Best-of merge with whatever is already stored for that day (an athlete can have more than
// one session on a date), so a later, slower session never overwrites a better reading.
async function upsertOnIce(supabase: any, athleteId: string, testDate: string, v: OnIce) {
  const { data: existing } = await supabase
    .from('performance_metrics')
    .select('on_ice_top_speed, on_ice_accel_max, on_ice_15yd_time')
    .eq('athlete_id', athleteId)
    .eq('test_date', testDate)
    .maybeSingle()
  const best = (a: number | null, b: number | null, pick: (x: number, y: number) => number) =>
    a === null ? b : b === null ? a : pick(a, b)
  return supabase.from('performance_metrics').upsert(
    {
      athlete_id: athleteId,
      test_date: testDate,
      on_ice_top_speed: best(v.topSpeedMph, existing?.on_ice_top_speed ?? null, Math.max),
      on_ice_accel_max: best(v.accelMax, existing?.on_ice_accel_max ?? null, Math.max),
      on_ice_15yd_time: best(v.time15, existing?.on_ice_15yd_time ?? null, Math.min),
    },
    { onConflict: 'athlete_id, test_date' }
  )
}

// ---- Off-ice sprint force-velocity profile -------------------------------------------------
// "Off-Ice Sprint Profiling": 20-yard sprints at 2 kg (some days also 10 kg / 20 kg reps, which
// aren't used here). From the best 2 kg rep's speed samples this computes the horizontal
// force-velocity profile (Samozino et al. 2016): fit v(t) = vmax * (1 - e^(-(t - t0)/tau)),
// derive horizontal force per kg = acceleration + air drag + the 1080 cable's pull back, then
// regress force on speed. F0 = force at zero speed, V0 = speed at zero force, Pmax = F0*V0/4,
// RFmax = highest share of horizontal force in the total ground force after 0.3 s.
function isOffIceSprintProfilingName(name: string) {
  return name.trim().toLowerCase() === "off-ice sprint profiling"
}
const G = 9.81
const DEFAULT_HEIGHT_M = 1.75
const MIN_PROFILE_DISTANCE_M = 13 // 15+ yard reps; shorter ones end before the curve flattens

type SprintProfile = { topSpeedMph: number; f0: number; v0Mph: number; rfmaxPct: number; pmax: number }

// sampleData: little-endian float32 records of [time s, position m, speed m/s, accel m/s^2, force N].
function decodeSamples(b64: string): { t: number; v: number }[] {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const view = new DataView(bytes.buffer)
  const out: { t: number; v: number }[] = []
  for (let off = 0; off + 20 <= bytes.length; off += 20) {
    out.push({ t: view.getFloat32(off, true), v: view.getFloat32(off + 8, true) })
  }
  return out
}

// Least-squares fit of the speed curve up to peak speed. vmax has a closed form for a given
// (t0, tau), so only those two are searched: a coarse grid, then a fine one around the best.
function fitSpeedCurve(samples: { t: number; v: number }[]) {
  let peak = 0
  for (let i = 1; i < samples.length; i++) if (samples[i].v > samples[peak].v) peak = i
  const pts = samples.slice(0, peak + 1)
  const evaluate = (t0: number, tau: number) => {
    let gv = 0, gg = 0
    const g = pts.map((p) => (p.t > t0 ? 1 - Math.exp(-(p.t - t0) / tau) : 0))
    for (let i = 0; i < pts.length; i++) { gv += pts[i].v * g[i]; gg += g[i] * g[i] }
    if (gg === 0) return null
    const vmax = gv / gg
    let sse = 0
    for (let i = 0; i < pts.length; i++) sse += (pts[i].v - vmax * g[i]) ** 2
    return { sse, vmax, tau, t0 }
  }
  type Fit = { sse: number; vmax: number; tau: number; t0: number }
  const search = (t0s: number[], taus: number[], start: Fit | null): Fit | null => {
    let found = start
    for (const t0 of t0s) for (const tau of taus) {
      const r = evaluate(t0, tau)
      if (r && (!found || r.sse < found.sse)) found = r
    }
    return found
  }
  const range = (from: number, to: number, step: number) => {
    const out: number[] = []
    for (let x = from; x <= to + 1e-9; x += step) out.push(Number(x.toFixed(4)))
    return out
  }
  const coarse = search(range(-0.3, 0.5, 0.05), range(0.3, 3.0, 0.1), null)
  if (!coarse) return null
  return search(range(coarse.t0 - 0.05, coarse.t0 + 0.05, 0.01), range(Math.max(0.2, coarse.tau - 0.1), coarse.tau + 0.1, 0.01), coarse)
}

function forceVelocityProfile(samples: { t: number; v: number }[], massKg: number, heightM: number, loadKg: number) {
  const fit = fitSpeedCurve(samples)
  if (!fit || !(fit.vmax > 0) || !(fit.tau > 0)) return null
  const { vmax, tau } = fit
  const frontalArea = 0.2025 * heightM ** 0.725 * massKg ** 0.425 * 0.266
  const dragK = 0.5 * 1.204 * frontalArea * 0.9
  const vs: number[] = []
  const fs: number[] = []
  let rfMax = 0
  for (let t = 0; t < 6 * tau; t += 0.01) {
    const v = vmax * (1 - Math.exp(-t / tau))
    const a = (vmax / tau) * Math.exp(-t / tau)
    const f = massKg * a + dragK * v * v + loadKg * G
    vs.push(v)
    fs.push(f / massKg)
    if (t >= 0.3) rfMax = Math.max(rfMax, f / Math.sqrt(f * f + (massKg * G) ** 2))
  }
  const n = vs.length
  const mv = vs.reduce((x, y) => x + y, 0) / n
  const mf = fs.reduce((x, y) => x + y, 0) / n
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (vs[i] - mv) * (fs[i] - mf); sxx += (vs[i] - mv) ** 2 }
  const slope = sxy / sxx
  const f0 = mf - slope * mv
  const v0 = -f0 / slope
  if (!(f0 > 0) || !(v0 > 0)) return null
  return { f0, v0, rfMax, pmax: (f0 * v0) / 4 }
}

async function sprintProfileFromSession(
  supabase: any,
  athleteId: string,
  sessionDetail: any,
  headers: Record<string, string>
): Promise<SprintProfile | null> {
  // Best 2 kg rep of the day by top speed; its samples give the profile.
  let best: { topSpeed: number; sampleData: string; load: number } | null = null
  for (const ex of sessionDetail?.exercises || []) {
    if (!isOffIceSprintProfilingName(ex?.exerciseTypeName || ex?.name || "")) continue
    for (const setRef of ex?.sets || []) {
      if (!setRef?.id) continue
      const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=true`, { headers })
      if (!setRes.ok) continue
      const setData = await setRes.json()
      for (const mg of setData?.motionGroups || []) {
        for (const motion of mg?.motions || []) {
          const loadKg = Number(motion?.resistanceValues?.concentricLoad)
          const topSpeed = Number(motion?.topSpeed)
          if (isNaN(loadKg) || Math.abs(loadKg - 2) > LOAD_TOLERANCE_KG) continue
          if (!(Number(motion?.totalDistance) >= MIN_PROFILE_DISTANCE_M) || !(topSpeed > 0) || !motion?.sampleData) continue
          if (!best || topSpeed > best.topSpeed) best = { topSpeed, sampleData: motion.sampleData, load: loadKg }
        }
      }
    }
  }
  if (!best) return null

  // Body mass from the latest recorded weight; height only refines air drag.
  const { data: profile } = await supabase.from('profiles').select('weight_lbs, height_inches').eq('id', athleteId).maybeSingle()
  const massKg = Number(profile?.weight_lbs) > 0 ? Number(profile.weight_lbs) / 2.20462 : null
  const heightM = Number(profile?.height_inches) > 0 ? Number(profile.height_inches) * 0.0254 : DEFAULT_HEIGHT_M
  const topSpeedMph = Number((best.topSpeed * MPS_TO_MPH).toFixed(2))
  if (!massKg) return { topSpeedMph, f0: NaN, v0Mph: NaN, rfmaxPct: NaN, pmax: NaN }

  const fv = forceVelocityProfile(decodeSamples(best.sampleData), massKg, heightM, best.load)
  if (!fv) return { topSpeedMph, f0: NaN, v0Mph: NaN, rfmaxPct: NaN, pmax: NaN }
  return {
    topSpeedMph,
    f0: Number(fv.f0.toFixed(2)),
    v0Mph: Number((fv.v0 * MPS_TO_MPH).toFixed(2)),
    rfmaxPct: Number((fv.rfMax * 100).toFixed(1)),
    pmax: Number(fv.pmax.toFixed(2)),
  }
}

// A later session on the same day only replaces the profile if its sprint was faster.
async function upsertSprintProfile(supabase: any, athleteId: string, testDate: string, p: SprintProfile) {
  const { data: existing } = await supabase
    .from('performance_metrics')
    .select('sprint_top_speed')
    .eq('athlete_id', athleteId)
    .eq('test_date', testDate)
    .maybeSingle()
  if (existing?.sprint_top_speed && existing.sprint_top_speed > p.topSpeedMph) return { error: null }
  const num = (x: number) => (isFinite(x) ? x : null)
  return supabase.from('performance_metrics').upsert(
    {
      athlete_id: athleteId,
      test_date: testDate,
      sprint_top_speed: p.topSpeedMph,
      sprint_f0: num(p.f0),
      sprint_v0: num(p.v0Mph),
      sprint_rfmax: num(p.rfmaxPct),
      sprint_pmax: num(p.pmax),
    },
    { onConflict: 'athlete_id, test_date' }
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const ten80ApiKey = Deno.env.get('TEN80_API_KEY') || ""

    if (!supabaseUrl || !supabaseServiceKey || !ten80ApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing environment variables." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const ten80Headers = { "X-1080-API-Key": ten80ApiKey, "Accept": "application/json" }

    let mode = "enqueue"
    let lookbackDays = 14
    let batchSize = 15
    let triggeredBy: 'auto' | 'manual' = 'auto'
    let offset = 0
    let body_athleteId = ''
    let body_testDate = ''
    let nameContains = 'on-ice'
    let body_athleteIds: string[] = []
    let body_setId = ''

    try {
      const body = await req.json()
      if (body?.mode) mode = body.mode
      if (typeof body?.offset === 'number') offset = body.offset
      if (typeof body?.athleteId === 'string') body_athleteId = body.athleteId
      if (typeof body?.testDate === 'string') body_testDate = body.testDate
      if (typeof body?.nameContains === 'string') nameContains = body.nameContains.toLowerCase()
      if (Array.isArray(body?.athleteIds)) body_athleteIds = body.athleteIds.map(String)
      if (typeof body?.setId === 'string') body_setId = body.setId
      if (typeof body?.lookbackDays === 'number') lookbackDays = body.lookbackDays
      if (typeof body?.batchSize === 'number') batchSize = body.batchSize
      if (body?.triggeredBy === 'manual') triggeredBy = 'manual'
    } catch (_) {
      // Body empty or not JSON
    }

    // ==========================================
    // MODE: ENQUEUE — find sessions belonging to known GVN athletes, queue new ones
    // ==========================================
    if (mode === "enqueue") {
      const clientRes = await fetch(`${API_BASE}/Client`, { headers: ten80Headers })
      if (!clientRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch 1080 Clients: HTTP ${clientRes.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      const rawClientsData = await clientRes.json()
      const ten80Clients = Array.isArray(rawClientsData) ? rawClientsData : (rawClientsData?.items || [])

      const { data: gvnProfiles, error: pErr } = await supabase.from('profiles').select('id, first_name, last_name')
      if (pErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch profiles: ${pErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      const nameToProfileId = new Map<string, string>()
      const profilesByLastName = new Map<string, { firstName: string; id: string }[]>()
      for (const p of gvnProfiles || []) {
        if (p?.first_name && p?.last_name) {
          const first = p.first_name.trim().toLowerCase()
          const last = p.last_name.trim().toLowerCase()
          nameToProfileId.set(`${first} ${last}`, p.id)
          if (!profilesByLastName.has(last)) profilesByLastName.set(last, [])
          profilesByLastName.get(last)!.push({ firstName: first, id: p.id })
        }
      }

      // clientId -> gvnProfileId, built from /Client's displayName matched to our roster.
      // Falls back to nickname-equivalent first names (Nate/Nathan/Nathen, Kenneth/Kenny/Ken,
      // Socrates/Sam) against an exact last-name match when the exact full name doesn't hit.
      const clientIdToProfileId = new Map<string, string>()
      for (const client of ten80Clients) {
        if (!client?.id || !client?.displayName) continue
        const cleanName = String(client.displayName).trim().toLowerCase()
        let profileId = nameToProfileId.get(cleanName)

        if (!profileId) {
          const parts = cleanName.split(/\s+/)
          const clientFirst = parts[0]
          const clientLast = parts.slice(1).join(' ')
          const candidates = profilesByLastName.get(clientLast) || []
          const hit = candidates.find((c) => firstNamesMatch(c.firstName, clientFirst))
          if (hit) profileId = hit.id
        }

        if (profileId) clientIdToProfileId.set(String(client.id), profileId)
      }

      const sessRes = await fetch(`${API_BASE}/Session?maxAgeDays=${lookbackDays}`, { headers: ten80Headers })
      if (!sessRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch Sessions: HTTP ${sessRes.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
      const sessions = await sessRes.json()

      const candidateRows: { session_id: string; client_id: string; athlete_id: string; exercise_type: string; status: string }[] = []
      for (const s of sessions || []) {
        if (!s?.id || !s?.clientId) continue
        const profileId = clientIdToProfileId.get(String(s.clientId))
        if (!profileId) continue
        candidateRows.push({
          session_id: String(s.id),
          client_id: String(s.clientId),
          athlete_id: profileId,
          exercise_type: 'sprint_check',
          status: 'pending',
        })
      }
      const matchedSessionCount = candidateRows.length

      // Bulk upsert in chunks, ignoring rows that already exist (unique constraint on
      // session_id) — much faster than one insert per row, which was timing out the
      // function on large lookback windows.
      let queuedCount = 0
      const chunkSize = 500
      for (let i = 0; i < candidateRows.length; i += chunkSize) {
        const chunk = candidateRows.slice(i, i + chunkSize)
        const { data: upserted, error: upsertErr } = await supabase
          .from('ten80_sync_queue')
          .upsert(chunk, { onConflict: 'session_id', ignoreDuplicates: true })
          .select('id')
        if (!upsertErr) queuedCount += upserted?.length || 0
      }

      const { count: totalPending } = await supabase
        .from('ten80_sync_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      return new Response(
        JSON.stringify({
          success: true,
          totalClients: ten80Clients.length,
          matchedAthletes: clientIdToProfileId.size,
          sessionsScanned: (sessions || []).length,
          matchedSessionCount,
          newlyQueued: queuedCount,
          totalPendingInQueue: totalPending || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==========================================
    // MODE: BACKFILL_PROFILES (alias BACKFILL_ON_ICE) — re-reads already-processed sessions
    // for On-Ice Sprint Profile and Off-Ice Sprint Profiling reps (process_batch only started
    // recording them after those sessions were completed). Pass athleteIds to limit it to
    // specific athletes; otherwise pages through every completed session with offset/batchSize.
    // ==========================================
    if (mode === "backfill_profiles" || mode === "backfill_on_ice") {
      let query = supabase
        .from('ten80_sync_queue')
        .select('session_id, athlete_id')
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
      query = body_athleteIds.length
        ? query.in('athlete_id', body_athleteIds)
        : query.range(offset, offset + batchSize - 1)
      const { data: rows, error: qErr } = await query
      if (qErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Queue query failed: ${qErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      let written = 0
      let sprintWritten = 0
      const errors: string[] = []
      for (const row of rows || []) {
        const sessRes = await fetch(`${API_BASE}/Session/${row.session_id}`, { headers: ten80Headers })
        if (!sessRes.ok) continue
        const sessionDetail = await sessRes.json()
        const testDate = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : null
        if (!testDate) continue
        const onIce = await onIceFromSession(sessionDetail, ten80Headers)
        if (onIce) {
          const { error } = await upsertOnIce(supabase, row.athlete_id, testDate, onIce)
          if (error) errors.push(`${row.session_id}: ${error.message}`)
          else written++
        }
        const sprint = await sprintProfileFromSession(supabase, row.athlete_id, sessionDetail, ten80Headers)
        if (sprint) {
          const { error } = await upsertSprintProfile(supabase, row.athlete_id, testDate, sprint)
          if (error) errors.push(`${row.session_id}: ${error.message}`)
          else sprintWritten++
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessionsChecked: (rows || []).length,
          onIceDaysWritten: written,
          sprintProfileDaysWritten: sprintWritten,
          nextOffset: body_athleteIds.length ? null : offset + (rows || []).length,
          errors: errors.slice(0, 10),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Diagnostic — tallies exercise names across a page of already-matched sessions, plus
    // sample reps from any exercise whose name contains `nameContains`. Read-only; used to
    // find what on-ice exercises are called before syncing them.
    if (mode === "scan_exercise_names") {
      const { data: rows } = await supabase
        .from('ten80_sync_queue')
        .select('session_id, athlete_id')
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1)

      const nameCounts: Record<string, number> = {}
      const matches: { athleteId: string; date: string; exercise: string; setId: string }[] = []
      for (const row of rows || []) {
        const sessRes = await fetch(`${API_BASE}/Session/${row.session_id}`, { headers: ten80Headers })
        if (!sessRes.ok) continue
        const sessionDetail = await sessRes.json()
        const date = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : ''
        for (const ex of sessionDetail?.exercises || []) {
          const exName = String(ex?.exerciseTypeName || ex?.name || '')
          nameCounts[exName] = (nameCounts[exName] || 0) + 1
          if (exName.toLowerCase().includes(nameContains)) {
            for (const setRef of ex?.sets || []) {
              if (setRef?.id) matches.push({ athleteId: row.athlete_id, date, exercise: exName, setId: String(setRef.id) })
            }
          }
        }
      }

      // Rep-level detail for the first few matching sets, to see loads/distances/speeds.
      const samples: any[] = []
      for (const m of matches.slice(0, 4)) {
        const setRes = await fetch(`${API_BASE}/TrainingData/Set/${m.setId}?includeSamples=false`, { headers: ten80Headers })
        if (!setRes.ok) continue
        const setData = await setRes.json()
        const motions = (setData?.motionGroups || []).flatMap((mg: any) => mg?.motions || [])
        samples.push({
          ...m,
          motions: motions.map((mo: any) => ({
            load: mo?.resistanceValues?.concentricLoad,
            topSpeed: mo?.topSpeed,
            peakSpeed: mo?.peakValues?.speed,
            distance: mo?.totalDistance,
            time: mo?.totalTime,
            keys: Object.keys(mo || {}),
          })),
        })
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessionsScanned: (rows || []).length,
          nextOffset: offset + (rows || []).length,
          nameCounts,
          matchingSets: matches.length,
          matchedAthletes: [...new Set(matches.map((m) => m.athleteId))],
          matches: matches.map(({ athleteId, date, exercise }) => ({ athleteId, date, exercise })),
          samples,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Diagnostic — the raw structure of one set, with samples, so profile fields (F0, V0,
    // RFmax...) can be located. Long arrays are cut to their first few entries.
    if (mode === "inspect_set") {
      const setRes = await fetch(`${API_BASE}/TrainingData/Set/${body_setId}?includeSamples=true`, { headers: ten80Headers })
      const raw = setRes.ok ? await setRes.json() : { httpStatus: setRes.status }
      const trim = (v: any): any =>
        Array.isArray(v)
          ? { length: v.length, first: v.slice(0, 3).map(trim) }
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]))
            : v
      return new Response(JSON.stringify({ success: setRes.ok, set: trim(raw) }, null, 1), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Diagnostic — every rep (with full speed/acceleration stats) from one athlete's
    // exercises whose name contains `nameContains`, across all their matched sessions.
    if (mode === "inspect_athlete_exercises") {
      const { data: rows } = await supabase
        .from('ten80_sync_queue')
        .select('session_id')
        .eq('athlete_id', body_athleteId)
        .eq('status', 'completed')

      const exerciseNames: Record<string, number> = {}
      const sets: any[] = []
      for (const row of rows || []) {
        const sessRes = await fetch(`${API_BASE}/Session/${row.session_id}`, { headers: ten80Headers })
        if (!sessRes.ok) continue
        const sessionDetail = await sessRes.json()
        const date = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : ''
        for (const ex of sessionDetail?.exercises || []) {
          const exName = String(ex?.exerciseTypeName || ex?.name || '')
          exerciseNames[exName] = (exerciseNames[exName] || 0) + 1
          if (!exName.toLowerCase().includes(nameContains)) continue
          for (const setRef of ex?.sets || []) {
            if (!setRef?.id) continue
            const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=false`, { headers: ten80Headers })
            if (!setRes.ok) continue
            const setData = await setRes.json()
            const motions = (setData?.motionGroups || []).flatMap((mg: any) => mg?.motions || [])
            sets.push({
              date,
              exercise: exName,
              setId: setRef.id,
              motions: motions.map((mo: any) => ({
                load: mo?.resistanceValues?.concentricLoad,
                topSpeed: mo?.topSpeed,
                distance: mo?.totalDistance,
                time: mo?.totalTime,
                isEccentric: mo?.isEccentric,
                peakValues: mo?.peakValues,
                averageValues: mo?.averageValues,
                accelDecelStats: mo?.accelDecelStats,
              })),
            })
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, athleteId: body_athleteId, sessions: (rows || []).length, exerciseNames, sets }, null, 1),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Diagnostic — dumps every 10yd Off-Ice Sprint motion (distance + speed) for one
    // athlete on one date, straight from the live API. Not wired into any cron; useful for
    // spot-checking a specific reported-bad reading.
    if (mode === "inspect_athlete_date") {
      const athleteId = body_athleteId
      const testDate = body_testDate

      const { data: rows } = await supabase
        .from('ten80_sync_queue')
        .select('session_id')
        .eq('athlete_id', athleteId)
        .eq('status', 'completed')

      const found: any[] = []
      for (const row of rows || []) {
        const sessRes = await fetch(`${API_BASE}/Session/${row.session_id}`, { headers: ten80Headers })
        if (!sessRes.ok) continue
        const sessionDetail = await sessRes.json()
        const sessDate = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : null
        if (sessDate !== testDate) continue

        for (const ex of sessionDetail?.exercises || []) {
          const exName = ex?.exerciseTypeName || ex?.name || ""
          if (!isTenYardOffIceSprint(exName)) continue
          for (const setRef of ex?.sets || []) {
            if (!setRef?.id) continue
            const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=false`, { headers: ten80Headers })
            if (!setRes.ok) continue
            const setData = await setRes.json()
            for (const mg of setData?.motionGroups || []) {
              for (const motion of mg?.motions || []) {
                found.push({
                  sessionId: row.session_id,
                  setId: setRef.id,
                  concentricLoad: motion?.resistanceValues?.concentricLoad,
                  topSpeed: motion?.topSpeed,
                  peakSpeed: motion?.peakValues?.speed,
                  totalDistance: motion?.totalDistance,
                  totalTime: motion?.totalTime,
                })
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, athleteId, testDate, sessionsForAthlete: (rows || []).length, motions: found }, null, 1),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==========================================
    // MODE: RECHECK_TOP_SPEED — one-time retroactive scan (see the migration comment on
    // ten80_recheck_staging for why this can't just re-run process_batch's normal upsert).
    // Resumable via a plain row offset over a fully deterministic order (created_at, then
    // id as a tiebreaker) — a first version of this cursored on created_at alone, and a
    // batch of 54 rows all sharing one bulk-insert timestamp meant whichever of them didn't
    // land in that page's LIMIT got silently skipped forever, since the next page's `.gt()`
    // excluded ties. OFFSET+LIMIT over a fully-ordered set can't drop rows that way. Call
    // repeatedly (feeding back offset + rows returned as the next offset) until remaining
    // === 0, then call apply_top_speed_recheck once.
    // ==========================================
    if (mode === "recheck_top_speed") {
      const { data: rows, error: qErr } = await supabase
        .from('ten80_sync_queue')
        .select('id, session_id, athlete_id, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1)

      if (qErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Queue query failed: ${qErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      // (athlete_id, test_date) -> best valid top speed (mph) seen in THIS batch
      const bestThisBatch = new Map<string, { athleteId: string; testDate: string; mph: number }>()
      let sessionsChecked = 0
      let tenYardSetsChecked = 0

      for (const row of rows || []) {
        sessionsChecked++
        const sessRes = await fetch(`${API_BASE}/Session/${row.session_id}`, { headers: ten80Headers })
        if (!sessRes.ok) continue
        const sessionDetail = await sessRes.json()
        const testDate = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : null
        if (!testDate) continue

        for (const ex of sessionDetail?.exercises || []) {
          const exName = ex?.exerciseTypeName || ex?.name || ""
          if (!isTenYardOffIceSprint(exName)) continue

          for (const setRef of ex?.sets || []) {
            if (!setRef?.id) continue
            tenYardSetsChecked++
            const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=false`, { headers: ten80Headers })
            if (!setRes.ok) continue
            const setData = await setRes.json()

            const key = `${row.athlete_id}_${testDate}`
            if (!bestThisBatch.has(key)) bestThisBatch.set(key, { athleteId: row.athlete_id, testDate, mph: 0 })

            for (const mg of setData?.motionGroups || []) {
              for (const motion of mg?.motions || []) {
                const loadKg = Number(motion?.resistanceValues?.concentricLoad)
                const speedMps = Number(motion?.topSpeed ?? motion?.peakValues?.speed)
                const totalDistance = Number(motion?.totalDistance)
                if (isNaN(speedMps) || speedMps <= 0) continue
                if (isNaN(loadKg) || Math.abs(loadKg - 2) > LOAD_TOLERANCE_KG) continue
                if (isNaN(totalDistance) || Math.abs(totalDistance - TEN_YARD_METERS) > DISTANCE_TOLERANCE_M) continue

                const mph = Number((speedMps * MPS_TO_MPH).toFixed(2))
                const entry = bestThisBatch.get(key)!
                if (mph > entry.mph) entry.mph = mph
              }
            }
          }
        }
      }

      // GREATEST-merge into staging — a key with no valid rep this batch still gets
      // recorded (mph left at 0, stored as null) so the apply step knows this date WAS
      // touched by a 10yd exercise and should be corrected, not just left alone.
      let staged = 0
      for (const entry of bestThisBatch.values()) {
        const { data: existing } = await supabase
          .from('ten80_recheck_staging')
          .select('best_top_speed_mph')
          .eq('athlete_id', entry.athleteId)
          .eq('test_date', entry.testDate)
          .maybeSingle()

        const merged = Math.max(entry.mph, existing?.best_top_speed_mph || 0)
        const { error: upsertErr } = await supabase
          .from('ten80_recheck_staging')
          .upsert(
            { athlete_id: entry.athleteId, test_date: entry.testDate, best_top_speed_mph: merged > 0 ? merged : null },
            { onConflict: 'athlete_id, test_date' }
          )
        if (!upsertErr) staged++
      }

      const { count: totalCompleted } = await supabase
        .from('ten80_sync_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')

      const nextOffset = offset + sessionsChecked

      return new Response(
        JSON.stringify({
          success: true,
          sessionsChecked,
          tenYardSetsChecked,
          keysStagedThisBatch: staged,
          nextOffset,
          remaining: Math.max((totalCompleted || 0) - nextOffset, 0),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==========================================
    // MODE: APPLY_TOP_SPEED_RECHECK — run once, after recheck_top_speed has scanned the
    // entire queue (remaining === 0). Overwrites performance_metrics.top_speed for every
    // (athlete, date) the scan touched — including explicitly nulling it out where every
    // rep that date turned out to be a mislabeled non-10-yard sprint.
    // ==========================================
    if (mode === "apply_top_speed_recheck") {
      const { data: stagingRows, error: stagingErr } = await supabase
        .from('ten80_recheck_staging')
        .select('athlete_id, test_date, best_top_speed_mph')
      if (stagingErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Staging query failed: ${stagingErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      let updated = 0
      let nulledOut = 0
      const errors: string[] = []
      for (const row of stagingRows || []) {
        const { error } = await supabase
          .from('performance_metrics')
          .update({ top_speed: row.best_top_speed_mph })
          .eq('athlete_id', row.athlete_id)
          .eq('test_date', row.test_date)
        if (error) {
          errors.push(`${row.athlete_id} ${row.test_date}: ${error.message}`)
        } else {
          updated++
          if (row.best_top_speed_mph === null) nulledOut++
        }
      }

      return new Response(
        JSON.stringify({ success: true, updated, nulledOut, errors: errors.slice(0, 10) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==========================================
    // MODE: PROCESS_BATCH — pull a batch of queued sessions and write real metrics
    // ==========================================
    if (mode === "process_one" || mode === "process_batch") {
      const limit = mode === "process_one" ? 1 : batchSize

      const { data: queueItems, error: qErr } = await supabase
        .from('ten80_sync_queue')
        .select('*')
        .eq('status', 'pending')
        .limit(limit)

      if (qErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Queue Query Failed: ${qErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      if (!queueItems || queueItems.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "Queue empty. All sessions processed!" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      let processedCount = 0
      let metricsWrittenCount = 0
      const errors: string[] = []

      for (const item of queueItems) {
        try {
          const sessRes = await fetch(`${API_BASE}/Session/${item.session_id}`, { headers: ten80Headers })
          if (!sessRes.ok) {
            await supabase.from('ten80_sync_queue').update({ status: 'failed' }).eq('id', item.id)
            errors.push(`${item.session_id}: session fetch HTTP ${sessRes.status}`)
            continue
          }
          const sessionDetail = await sessRes.json()
          const testDate = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : new Date().toISOString().split('T')[0]

          const v0RepPoints: { loadKg: number; speedMps: number }[] = []
          let topSpeed2kgMps = 0

          for (const ex of sessionDetail?.exercises || []) {
            const exName = ex?.exerciseTypeName || ex?.name || ""
            const wantsV0 = isOffIceSprintProfiling(exName)
            const wantsTopSpeed = isTenYardOffIceSprint(exName)
            if (!wantsV0 && !wantsTopSpeed) continue

            for (const setRef of ex?.sets || []) {
              if (!setRef?.id) continue
              const setRes = await fetch(`${API_BASE}/TrainingData/Set/${setRef.id}?includeSamples=false`, { headers: ten80Headers })
              if (!setRes.ok) continue
              const setData = await setRes.json()

              for (const mg of setData?.motionGroups || []) {
                for (const motion of mg?.motions || []) {
                  const loadKg = Number(motion?.resistanceValues?.concentricLoad)
                  const speedMps = Number(motion?.topSpeed ?? motion?.peakValues?.speed)
                  if (isNaN(speedMps) || speedMps <= 0) continue

                  if (wantsV0 && !isNaN(loadKg)) {
                    v0RepPoints.push({ loadKg, speedMps })
                  }
                  if (wantsTopSpeed && !isNaN(loadKg) && Math.abs(loadKg - 2) <= LOAD_TOLERANCE_KG) {
                    const totalDistance = Number(motion?.totalDistance)
                    const isGenuineTenYards = !isNaN(totalDistance) && Math.abs(totalDistance - TEN_YARD_METERS) <= DISTANCE_TOLERANCE_M
                    if (isGenuineTenYards && speedMps > topSpeed2kgMps) topSpeed2kgMps = speedMps
                  }
                }
              }
            }
          }

          // Theoretical V0 via load-velocity linear regression (intercept at zero load)
          let v0Mps: number | null = null
          if (v0RepPoints.length >= 2) {
            const n = v0RepPoints.length
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
            let maxObservedSpeed = 0
            for (const pt of v0RepPoints) {
              sumX += pt.loadKg
              sumY += pt.speedMps
              sumXY += pt.loadKg * pt.speedMps
              sumXX += pt.loadKg * pt.loadKg
              if (pt.speedMps > maxObservedSpeed) maxObservedSpeed = pt.speedMps
            }
            const denom = n * sumXX - sumX * sumX
            if (denom !== 0) {
              const slope = (n * sumXY - sumX * sumY) / denom
              const intercept = (sumY - slope * sumX) / n
              v0Mps = intercept > maxObservedSpeed ? intercept : maxObservedSpeed
            } else {
              v0Mps = maxObservedSpeed
            }
          } else if (v0RepPoints.length === 1) {
            v0Mps = v0RepPoints[0].speedMps
          }

          // Only include fields we actually computed, so the upsert merges rather than
          // nulling out whichever metric the OTHER exercise in this session reported.
          const payload: Record<string, any> = { athlete_id: item.athlete_id, test_date: testDate }
          if (v0Mps !== null) payload.v0_speed = Number((v0Mps * MPS_TO_MPH).toFixed(2))
          if (topSpeed2kgMps > 0) payload.top_speed = Number((topSpeed2kgMps * MPS_TO_MPH).toFixed(2))

          if (payload.v0_speed !== undefined || payload.top_speed !== undefined) {
            const { error: upsertErr } = await supabase
              .from('performance_metrics')
              .upsert(payload, { onConflict: 'athlete_id, test_date' })
            if (upsertErr) {
              errors.push(`${item.session_id}: upsert failed - ${upsertErr.message}`)
            } else {
              metricsWrittenCount++
            }
          }

          const onIce = await onIceFromSession(sessionDetail, ten80Headers)
          if (onIce) {
            const { error: onIceErr } = await upsertOnIce(supabase, item.athlete_id, testDate, onIce)
            if (onIceErr) errors.push(`${item.session_id}: on-ice upsert failed - ${onIceErr.message}`)
            else metricsWrittenCount++
          }

          const sprint = await sprintProfileFromSession(supabase, item.athlete_id, sessionDetail, ten80Headers)
          if (sprint) {
            const { error: sprintErr } = await upsertSprintProfile(supabase, item.athlete_id, testDate, sprint)
            if (sprintErr) errors.push(`${item.session_id}: sprint profile upsert failed - ${sprintErr.message}`)
            else metricsWrittenCount++
          }

          await supabase.from('ten80_sync_queue').update({ status: 'completed' }).eq('id', item.id)
          processedCount++
        } catch (itemErr: any) {
          await supabase.from('ten80_sync_queue').update({ status: 'failed' }).eq('id', item.id)
          errors.push(`${item.session_id}: ${itemErr?.message || String(itemErr)}`)
        }
      }

      const { count: remainingCount } = await supabase
        .from('ten80_sync_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (metricsWrittenCount > 0) {
        await supabase.from('import_status').upsert(
          { source: '1080', last_imported_at: new Date().toISOString(), triggered_by: triggeredBy, records_count: metricsWrittenCount },
          { onConflict: 'source, triggered_by' }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          processedCount,
          metricsWrittenCount,
          remainingInQueue: remainingCount || 0,
          errors: errors.slice(0, 10),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err: any) {
    const errorMsg = typeof err === 'object' && err !== null && 'message' in err
      ? String(err.message)
      : String(err)

    return new Response(
      JSON.stringify({ success: false, caughtError: errorMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
