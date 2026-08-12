'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Check, X } from 'lucide-react'
import { searchUnclaimedAthletes, approveSignupRequest, denySignupRequest } from './actions'

interface PendingRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
}

interface MatchCandidate {
  id: string
  first_name: string
  last_name: string
}

function MatchPicker({
  request,
  onApproved,
}: {
  request: PendingRow
  onApproved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(`${request.first_name} ${request.last_name}`)
  const [results, setResults] = useState<MatchCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = setTimeout(async () => {
      const res = await searchUnclaimedAthletes(query)
      if (res.success) setResults(res.results as MatchCandidate[])
    }, 200)
    return () => clearTimeout(handle)
  }, [query, open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleApprove(linkToExistingProfileId?: string) {
    setBusy(true)
    await approveSignupRequest({ pendingProfileId: request.id, linkToExistingProfileId })
    setBusy(false)
    onApproved()
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleApprove()}
        disabled={busy}
        className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" />
        <span>Approve as new</span>
      </button>
      <div ref={boxRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-lg transition disabled:opacity-50"
        >
          Link to existing...
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roster..."
              className="w-full bg-slate-950 border-b border-slate-800 rounded-t-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
            <div className="max-h-56 overflow-y-auto">
              {results.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No unclaimed matches.</div>}
              {results.map((r) => (
                <button
                  key={r.id}
                  disabled={busy}
                  onClick={() => handleApprove(r.id)}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {r.first_name} {r.last_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SignupRequestsPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [requests, setRequests] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)

  async function loadRequests() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'pending')
      .order('first_name', { ascending: true })
    setRequests((data || []) as PendingRow[])
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'coach' && profile?.role !== 'admin') {
        router.push('/athlete')
        return
      }
      setAuthorized(true)
      await loadRequests()
    }
    init()
  }, [router])

  async function handleDeny(id: string) {
    if (!confirm('Deny this request? This permanently deletes the account.')) return
    await denySignupRequest({ pendingProfileId: id })
    await loadRequests()
  }

  if (!authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Signup Requests</h1>
        <Link
          href="/coach"
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
        {loading && <div className="p-6 text-center text-slate-400">Loading...</div>}
        {!loading && requests.length === 0 && (
          <div className="p-6 text-center text-slate-400">No pending requests.</div>
        )}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <div className="font-semibold text-white">{r.first_name} {r.last_name}</div>
              <div className="text-xs text-slate-500">{r.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <MatchPicker request={r} onApproved={loadRequests} />
              <button
                onClick={() => handleDeny(r.id)}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 text-xs font-semibold px-3 py-2 rounded-lg transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Deny</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
