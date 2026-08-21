'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Plus, Users, Trash2 } from 'lucide-react'
import { listGroupsWithCounts, createGroupAction, deleteGroupAction } from './actions'

interface GroupRow {
  id: string
  name: string
  athleteCount: number
}

export default function GroupsListPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function loadGroups() {
    setLoading(true)
    const res = await listGroupsWithCounts()
    if (res.success) setGroups(res.results as GroupRow[])
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
      await loadGroups()
    }
    init()
  }, [router])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')
    setCreating(true)
    const res = await createGroupAction({ name })
    setCreating(false)
    if (!res.success) {
      setError(res.error || 'Failed to create group.')
      return
    }
    setNewName('')
    await loadGroups()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes all its athletes and attendance history.`)) return
    const res = await deleteGroupAction({ groupId: id })
    if (res.success) await loadGroups()
    else alert(res.error)
  }

  if (!authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight uppercase">Groups</h1>
        <Link
          href="/coach"
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="New group name (e.g. Tuesday Skaters)..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-600"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2.5 rounded-lg transition text-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>{creating ? 'Creating...' : 'New Group'}</span>
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 divide-y divide-slate-800">
        {loading && <div className="p-6 text-center text-slate-400">Loading groups...</div>}
        {!loading && groups.length === 0 && (
          <div className="p-6 text-center text-slate-400">No groups yet — create one above.</div>
        )}
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition">
            <Link href={`/coach/groups/${g.id}`} className="flex-1 flex items-center gap-3">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-white">{g.name}</span>
              <span className="text-xs text-slate-500">
                {g.athleteCount} athlete{g.athleteCount === 1 ? '' : 's'}
              </span>
            </Link>
            <button
              onClick={() => handleDelete(g.id, g.name)}
              className="p-2 rounded-lg hover:bg-red-950/40 text-slate-500 hover:text-red-400 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
