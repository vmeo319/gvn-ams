'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { triggerManualSyncAction } from './actions'

interface ImportStatusRow {
  source: string
  last_imported_at: string
  triggered_by: 'auto' | 'manual'
}

function formatLine(row: ImportStatusRow | undefined): string {
  if (!row) return 'never'
  return new Date(row.last_imported_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const SOURCES: { key: 'sync-hawkins' | 'sync-1080'; label: string; statusKey: string }[] = [
  { key: 'sync-hawkins', label: 'Hawkins Force Plate', statusKey: 'hawkins' },
  { key: 'sync-1080', label: '1080 Motion Sprint', statusKey: '1080' },
]

export default function SyncPanel() {
  const [importStatus, setImportStatus] = useState<Record<string, ImportStatusRow>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{ source: string; success: boolean; msg: string } | null>(null)

  async function loadStatus() {
    const { data } = await supabase.from('import_status').select('source, last_imported_at, triggered_by')
    const map: Record<string, ImportStatusRow> = {}
    ;(data || []).forEach((row: any) => { map[`${row.source}_${row.triggered_by}`] = row })
    setImportStatus(map)
  }

  useEffect(() => {
    loadStatus()
  }, [])

  async function handleRun(source: 'sync-hawkins' | 'sync-1080', label: string) {
    setRunning(source)
    setResult(null)
    const res = await triggerManualSyncAction({ source })
    setRunning(null)
    if (!res.success) {
      setResult({ source, success: false, msg: res.error || 'Sync failed.' })
      return
    }
    const summary = res.result ? JSON.stringify(res.result) : 'Done.'
    setResult({ source, success: true, msg: `${label} sync triggered — ${summary}` })
    await loadStatus()
  }

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div className="flex items-center space-x-2">
        <RefreshCw className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Data Sync</h3>
      </div>

      {result && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
            result.success ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-red-950/40 border-red-800 text-red-300'
          }`}
        >
          {result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="break-all">{result.msg}</span>
        </div>
      )}

      <div className="space-y-3">
        {SOURCES.map((s) => (
          <div key={s.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-200">{s.label}</div>
              <div className="text-[11px] text-slate-500">
                Auto: {formatLine(importStatus[`${s.statusKey}_auto`])} · Manual: {formatLine(importStatus[`${s.statusKey}_manual`])}
              </div>
            </div>
            <button
              onClick={() => handleRun(s.key, s.label)}
              disabled={running === s.key}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${running === s.key ? 'animate-spin' : ''}`} />
              <span>{running === s.key ? 'Running...' : 'Run Now'}</span>
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Hawkins runs nightly at 2am, 1080 enqueues daily at 3am and drains every 5 minutes. This just fires the same job early.
      </p>
    </div>
  )
}
