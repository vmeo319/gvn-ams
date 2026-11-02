'use client'

import React from 'react'
import { Check, X, Zap } from 'lucide-react'
import { Metric, SPRINT_LEVEL_RULES, formatTickDate, sprintPrescription } from './metricInfo'

// The athlete's suggested sprint level from their most recent off-ice sprint profile, walked
// through GVN's decision tree so the coach can see which criterion set it.
export default function SprintLevelCard({ metrics }: { metrics: Metric[] }) {
  const latest = [...metrics]
    .filter((m) => m.sprint_f0 !== null && m.sprint_v0 !== null && m.sprint_rfmax !== null)
    .sort((a, b) => b.test_date.localeCompare(a.test_date))[0]
  if (!latest) return null

  const values = { rfmax: Number(latest.sprint_rfmax), f0: Number(latest.sprint_f0), v0: Number(latest.sprint_v0) }
  const { prescription, failedRule } = sprintPrescription(values)
  const failedIndex = SPRINT_LEVEL_RULES.findIndex((r) => r.label === failedRule)
  const checked = failedIndex === -1 ? SPRINT_LEVEL_RULES : SPRINT_LEVEL_RULES.slice(0, failedIndex + 1)

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400">
            <Zap className="w-4 h-4 text-yellow-400" />
            Suggested sprint level
          </div>
          <div className="text-2xl font-bold text-white mt-0.5">{prescription}</div>
          <div className="text-xs text-slate-500 mt-0.5">From the off-ice sprint profile on {formatTickDate(latest.test_date, true)}</div>
        </div>
        <div className="flex gap-4 text-xs text-slate-400">
          <div>
            RFmax <span className="block text-base font-semibold text-white">{values.rfmax.toFixed(1)}%</span>
          </div>
          <div>
            F0 <span className="block text-base font-semibold text-white">{values.f0.toFixed(2)} N/kg</span>
          </div>
          <div>
            V0 <span className="block text-base font-semibold text-white">{values.v0.toFixed(1)} mph</span>
          </div>
        </div>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs">
        {checked.map((rule) => {
          const passed = rule.passes(values)
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-md border ${
                passed ? 'border-emerald-800 text-emerald-300' : 'border-red-800 text-red-300'
              }`}
            >
              {passed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {rule.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
