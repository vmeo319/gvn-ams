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
//                                                motion has resistanceValues.concentricLoad (kg)
//                                                and topSpeed / peakValues.speed (m/s)
const API_BASE = "https://publicapi.1080motion.com"

const MPS_TO_MPH = 2.23694
const LOAD_TOLERANCE_KG = 0.5 // "2kg" sprints in practice land at 1.5-2.5

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

    try {
      const body = await req.json()
      if (body?.mode) mode = body.mode
      if (typeof body?.lookbackDays === 'number') lookbackDays = body.lookbackDays
      if (typeof body?.batchSize === 'number') batchSize = body.batchSize
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
                    if (speedMps > topSpeed2kgMps) topSpeed2kgMps = speedMps
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
          { source: '1080', last_imported_at: new Date().toISOString(), triggered_by: 'auto', records_count: metricsWrittenCount },
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
