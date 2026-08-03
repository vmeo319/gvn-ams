'use client'

import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { Upload, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function Import1080Tab({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ success?: boolean; msg: string } | null>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setSummary({ msg: 'Parsing 1080 Motion export...' })

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

      if (!rows || rows.length === 0) {
        throw new Error('File appears to be empty.')
      }

      // Fetch profiles for athlete matching
      const { data: profiles, error: profileErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')

      if (profileErr) throw profileErr

      const profileMap = new Map<string, string>()
      profiles?.forEach((p) => {
        if (p.first_name && p.last_name) {
          profileMap.set(`${p.first_name.trim()} ${p.last_name.trim()}`.toLowerCase(), p.id)
        }
      })

      const athleteSessions: Record<string, { athleteId: string; date: string; isV0: boolean; is10Yd: boolean; reps: { load: number; speed: number }[] }> = {}
      const MPS_TO_MPH = 2.23694

      rows.forEach((row) => {
        const rawName = row['User Name'] || row['Client'] || row['Name'] || row['Athlete'] || ''
        const exName = (row['Exercise Name'] || row['Exercise'] || '').toLowerCase()
        const loadKg = parseFloat(row['Load (kg)'] || row['Load'] || row['External Load'] || '2.0')
        const speedMps = parseFloat(row['Peak Speed (m/s)'] || row['Peak Speed'] || row['Top Speed'] || '0')
        const rawDate = row['Date'] || row['Created'] || new Date().toISOString().split('T')[0]

        const cleanName = rawName.trim().toLowerCase()
        const matchedProfileId = profileMap.get(cleanName)

        if (!matchedProfileId || speedMps <= 0) return

        const isV0 = exName.includes('off-ice sprint profiling') || exName.includes('sprint profiling')
        const is10Yd = exName.includes('10yd off-ice sprint') || exName.includes('10yd sprint')

        if (!isV0 && !is10Yd) return

        const sessionKey = `${matchedProfileId}_${rawDate}_${isV0 ? 'v0' : '10yd'}`

        if (!athleteSessions[sessionKey]) {
          athleteSessions[sessionKey] = {
            athleteId: matchedProfileId,
            date: String(rawDate).split('T')[0],
            isV0,
            is10Yd,
            reps: []
          }
        }

        athleteSessions[sessionKey].reps.push({ load: loadKg, speed: speedMps })
      })

      const metricsToInsert: any[] = []

      Object.values(athleteSessions).forEach((session) => {
        let maxSpeedMps = Math.max(...session.reps.map((r) => r.speed))
        let calculatedV0Mps = maxSpeedMps

        if (session.isV0 && session.reps.length >= 2) {
          const n = session.reps.length
          let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

          session.reps.forEach((pt) => {
            sumX += pt.load
            sumY += pt.speed
            sumXY += pt.load * pt.speed
            sumXX += pt.load * pt.load
          })

          const denom = n * sumXX - sumX * sumX
          if (denom !== 0) {
            const slope = (n * sumXY - sumX * sumY) / denom
            const intercept = (sumY - slope * sumX) / n
            if (intercept > maxSpeedMps) calculatedV0Mps = intercept
          }
        }

        const maxSpeedMph = Number((maxSpeedMps * MPS_TO_MPH).toFixed(2))
        const calculatedV0Mph = Number((calculatedV0Mps * MPS_TO_MPH).toFixed(2))

        metricsToInsert.push({
          athlete_id: session.athleteId,
          test_date: session.date,
          v0_speed: session.isV0 ? calculatedV0Mph : null,
          top_speed: session.is10Yd ? maxSpeedMph : null
        })
      });

      if (metricsToInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('performance_metrics')
          .upsert(metricsToInsert, { onConflict: 'athlete_id, test_date' })

        if (insertErr) throw insertErr

        setSummary({ success: true, msg: `Successfully imported ${metricsToInsert.length} record(s)!` })
        if (onUploadSuccess) onUploadSuccess()
      } else {
        setSummary({ success: false, msg: 'No matching athlete sprint records found in this file.' })
      }
    } catch (err: any) {
      setSummary({ success: false, msg: `Parsing error: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100">
      <h3 className="text-lg font-bold text-white mb-1">1080 Motion File Importer</h3>
      <p className="text-xs text-slate-400 mb-4">Drop raw 1080 Motion Excel export (.xlsx) to parse $V_0$ linear regressions and top speeds directly into athlete profiles.</p>

      {summary && (
        <div className={`p-3 mb-4 rounded-lg text-xs flex items-center space-x-2 ${
          summary.success ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300' : 'bg-red-950/50 border border-red-800 text-red-300'
        }`}>
          {summary.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{summary.msg}</span>
        </div>
      )}

      <div className="border-2 border-dashed border-slate-700 hover:border-red-500 rounded-xl p-6 text-center bg-slate-950/40 relative cursor-pointer transition">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          disabled={loading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center space-y-2">
          <Upload className="w-6 h-6 text-slate-400" />
          <p className="text-xs font-semibold text-slate-300">{loading ? 'Processing 1080 File...' : 'Upload 1080 Export File'}</p>
        </div>
      </div>
    </div>
  )
}