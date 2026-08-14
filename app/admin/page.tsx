'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, UserPlus, ShieldCheck } from 'lucide-react'
import UsersPanel from './UsersPanel'
import CreateCoachPanel from './CreateCoachPanel'
import LocationsPanel from './LocationsPanel'
import SyncPanel from './SyncPanel'

export default function AdminPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [usersKey, setUsersKey] = useState(0)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      // Strictly admin-only — unlike the rest of the app, coaches don't get in here.
      if (profile?.role !== 'admin') {
        router.push('/coach')
        return
      }
      setUserId(user.id)
      setAuthorized(true)
    }
    init()
  }, [router])

  if (!authorized || !userId) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center space-x-4">
            <img src="/gvn-logo-letters.png" alt="GVN Logo" className="h-10 w-auto" />
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-red-500" />
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin</h1>
              </div>
              <p className="text-sm text-slate-400">Accounts, roles, locations, and data sync</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/coach/signup-requests"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <span>Signup Requests</span>
            </Link>
            <Link
              href="/coach"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Coach Dashboard</span>
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Accounts & Roles</h2>
          <UsersPanel key={usersKey} selfId={userId} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CreateCoachPanel onCreated={() => setUsersKey((k) => k + 1)} />
          <LocationsPanel />
        </div>

        <SyncPanel />
      </div>
    </div>
  )
}
