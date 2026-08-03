import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-1080-api-key',
}

serve(async (req) => {
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

    let mode = "enqueue"
    let targetAthleteIndex = 0

    try {
      const body = await req.json()
      if (body?.mode) mode = body.mode
      if (typeof body?.athleteIndex === 'number') targetAthleteIndex = body.athleteIndex
    } catch (_) {
      // Body empty or not JSON
    }

    // ==========================================
    // MODE B: PROCESS 1 QUEUED SESSION DETAIL
    // ==========================================
    if (mode === "process_one") {
      const { data: queueItems, error: qErr } = await supabase
        .from('ten80_sync_queue')
        .select('*')
        .eq('status', 'pending')
        .limit(1)

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

      const currentItem = queueItems[0]

      const sessRes = await fetch(`https://publicapi.1080motion.com/Session/${currentItem.session_id}`, {
        headers: { "X-1080-API-Key": ten80ApiKey, "Accept": "application/json" }
      })

      if (!sessRes.ok) {
        await supabase.from('ten80_sync_queue').update({ status: 'failed' }).eq('id', currentItem.id)
        return new Response(
          JSON.stringify({ success: false, error: `Failed to fetch session detail (HTTP ${sessRes.status})` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      const sessionDetail = await sessRes.json()
      const exercises = sessionDetail?.exercises || []
      const MPS_TO_MPH = 2.23694
      let importedMetricId = null

      for (const ex of exercises) {
        const exName = (ex?.exerciseTypeName || ex?.name || "").toLowerCase()
        const isV0 = exName.includes("off-ice sprint profiling") || exName.includes("sprint profiling")
        const is10Yd = exName.includes("10yd off-ice sprint") || exName.includes("10yd sprint")

        if (!isV0 && !is10Yd) continue // Strict sprint filter

        const sets = ex?.sets || []
        let maxSpeedMps = 0
        const repPoints: { loadKg: number; speedMps: number }[] = []

        for (const sRef of sets) {
          if (!sRef?.id) continue

          const setRes = await fetch(`https://publicapi.1080motion.com/Set/${sRef.id}`, {
            headers: { "X-1080-API-Key": ten80ApiKey, "Accept": "application/json" }
          })

          if (setRes.ok) {
            const setDetail = await setRes.json()
            const processSpeed = (item: any) => {
              if (!item) return
              const speed = item?.peakValues?.speed || item?.peakSpeed || item?.topSpeed || item?.speed || item?.maxSpeed || 0
              const load = item?.concentricLoad || item?.load || setDetail?.externalLoad || 2.0
              if (speed > maxSpeedMps) maxSpeedMps = speed
              if (speed > 0) repPoints.push({ loadKg: Number(load) || 2.0, speedMps: speed })
            }

            processSpeed(setDetail)
            const subArrays = [setDetail?.reps, setDetail?.motionGroups, setDetail?.motions]
            for (const arr of subArrays) {
              if (Array.isArray(arr)) {
                for (const sub of arr) {
                  processSpeed(sub)
                  if (Array.isArray(sub?.motions)) sub.motions.forEach(processSpeed)
                }
              }
            }
          }
        }

        // Theoretical V0 Calculation via Linear Regression
        let calculatedV0Mps = maxSpeedMps
        if (isV0 && repPoints.length >= 2) {
          const n = repPoints.length
          let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
          for (const pt of repPoints) {
            sumX += pt.loadKg
            sumY += pt.speedMps
            sumXY += pt.loadKg * pt.speedMps
            sumXX += pt.loadKg * pt.loadKg
          }
          const denom = (n * sumXX - sumX * sumX)
          if (denom !== 0) {
            const slope = (n * sumXY - sumX * sumY) / denom
            const intercept = (sumY - slope * sumX) / n
            if (intercept > maxSpeedMps) calculatedV0Mps = intercept
          }
        }

        const maxSpeedMph = Number((maxSpeedMps * MPS_TO_MPH).toFixed(2))
        const calculatedV0Mph = Number((calculatedV0Mps * MPS_TO_MPH).toFixed(2))

        if (maxSpeedMph > 0) {
          const testDate = sessionDetail?.created ? String(sessionDetail.created).split('T')[0] : new Date().toISOString().split('T')[0]

          const { data: inserted } = await supabase
            .from('performance_metrics')
            .insert({
              athlete_id: currentItem.athlete_id,
              test_date: testDate,
              v0_speed: isV0 ? calculatedV0Mph : null,
              top_speed: is10Yd ? maxSpeedMph : null
            })
            .select('id')

          importedMetricId = inserted?.[0]?.id || null
        }
      }

      await supabase.from('ten80_sync_queue').update({ status: 'completed' }).eq('id', currentItem.id)

      const { count: remainingCount } = await supabase
        .from('ten80_sync_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')

      return new Response(
        JSON.stringify({
          success: true,
          processedSessionId: currentItem.session_id,
          importedMetricId,
          remainingInQueue: remainingCount || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ==========================================
    // MODE A: ENQUEUE PENDING SESSIONS (SAFE MATCH)
    // ==========================================
    const clientRes = await fetch("https://publicapi.1080motion.com/Client", {
      headers: { "X-1080-API-Key": ten80ApiKey }
    })

    if (!clientRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch 1080 Clients: HTTP ${clientRes.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const rawClientsData = await clientRes.json()
    // Safe normalization of 1080 Clients payload array
    const ten80Clients = Array.isArray(rawClientsData)
      ? rawClientsData
      : (rawClientsData?.items || rawClientsData?.clients || rawClientsData?.data || [])

    const { data: gvnProfiles, error: pErr } = await supabase.from('profiles').select('id, first_name, last_name')
    if (pErr) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to fetch profiles: ${pErr.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const gvnProfileMap = new Map<string, string>()

    if (Array.isArray(gvnProfiles)) {
      for (const p of gvnProfiles) {
        if (p?.first_name && p?.last_name) {
          gvnProfileMap.set(`${p.first_name.trim()} ${p.last_name.trim()}`.toLowerCase(), p.id)
        }
      }
    }

    const matchedAthletes: { clientId: string; displayName: string; gvnProfileId: string }[] = []

    for (const client of ten80Clients) {
      if (client?.id && client?.displayName) {
        const cleanName = String(client.displayName).trim().toLowerCase()
        const matchedId = gvnProfileMap.get(cleanName)
        if (matchedId) {
          matchedAthletes.push({
            clientId: String(client.id),
            displayName: String(client.displayName).trim(),
            gvnProfileId: matchedId
          })
        }
      }
    }

    if (matchedAthletes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No matched athletes found between 1080 Motion clients and Supabase profiles.",
          total1080ClientsFound: ten80Clients.length,
          totalSupabaseProfilesFound: gvnProfiles?.length || 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Safely select athlete at target index
    const safeIndex = targetAthleteIndex % matchedAthletes.length
    const currentAthlete = matchedAthletes[safeIndex]

    if (!currentAthlete || !currentAthlete.clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid athlete object extracted." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    let queuedForAthlete = 0

    const sessRes = await fetch(`https://publicapi.1080motion.com/Session/Search?clientId=${currentAthlete.clientId}&take=10`, {
      headers: { "X-1080-API-Key": ten80ApiKey, "Accept": "application/json" }
    })

    if (sessRes.ok) {
      const sessData = await sessRes.json()
      const sessions = Array.isArray(sessData) ? sessData : (sessData?.items || sessData?.sessions || [])

      for (const s of sessions) {
        if (!s?.id) continue
        const { error: insertErr } = await supabase.from('ten80_sync_queue').insert({
          session_id: String(s.id),
          client_id: currentAthlete.clientId,
          athlete_id: currentAthlete.gvnProfileId,
          exercise_type: 'sprint_check',
          status: 'pending'
        })
        if (!insertErr) queuedForAthlete++
      }
    }

    const { count: totalPending } = await supabase
      .from('ten80_sync_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    return new Response(
      JSON.stringify({
        success: true,
        seededAthlete: currentAthlete.displayName,
        nextAthleteIndex: safeIndex + 1,
        matchedAthletesTotal: matchedAthletes.length,
        newlyQueuedSessions: queuedForAthlete,
        totalPendingInQueue: totalPending || 0
      }),
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