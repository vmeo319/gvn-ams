'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { MapPin, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { createLocationAction, renameLocationAction, deleteLocationAction } from './actions'

interface LocationRow {
  id: string
  name: string
}

export default function LocationsPanel() {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('locations').select('id, name').order('name')
    setLocations((data || []) as LocationRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setError('')
    setAdding(true)
    const res = await createLocationAction({ name: newName })
    setAdding(false)
    if (!res.success) {
      setError(res.error || 'Failed to add location.')
      return
    }
    setNewName('')
    await load()
  }

  function startEdit(loc: LocationRow) {
    setEditingId(loc.id)
    setEditingName(loc.name)
  }

  async function saveEdit(id: string) {
    if (!editingName.trim()) return
    setError('')
    setBusyId(id)
    const res = await renameLocationAction({ id, name: editingName })
    setBusyId(null)
    if (!res.success) {
      setError(res.error || 'Failed to rename location.')
      return
    }
    setEditingId(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this location? This only works if no profiles use it.')) return
    setError('')
    setBusyId(id)
    const res = await deleteLocationAction({ id })
    setBusyId(null)
    if (!res.success) {
      setError(res.error || 'Failed to delete location.')
      return
    }
    await load()
  }

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div className="flex items-center space-x-2">
        <MapPin className="w-4 h-4 text-red-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Locations</h3>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="New location name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-2 rounded-lg text-xs transition disabled:opacity-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </form>

      <div className="divide-y divide-slate-800/60">
        {loading ? (
          <div className="py-6 text-center text-slate-500 text-sm">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-sm">No locations yet.</div>
        ) : (
          locations.map((loc) => (
            <div key={loc.id} className="flex items-center justify-between py-2.5">
              {editingId === loc.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(loc.id)}
                  className="flex-1 mr-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              ) : (
                <span className="text-sm text-slate-200">{loc.name}</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {editingId === loc.id ? (
                  <>
                    <button onClick={() => saveEdit(loc.id)} disabled={busyId === loc.id} className="p-1.5 rounded-lg hover:bg-slate-800 text-emerald-400 transition disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(loc)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(loc.id)} disabled={busyId === loc.id} className="p-1.5 rounded-lg hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
