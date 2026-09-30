'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Users, Check, ChevronDown, Plus, Search } from 'lucide-react'
import { updateAthleteGroupsAction, createGroupAction } from './actions'

export interface GroupOption {
  id: string
  name: string
  locationId: string
  locationName: string
  birthYear: number | null
}

// Groups live under a location, so an athlete's picker only offers groups at the locations
// they train at. With more than one location, each option is tagged with where it is.
export default function GroupCell({
  athleteId,
  athleteLocationIds,
  locations,
  selectedIds,
  allGroups,
  isOpen,
  onToggleOpen,
  onSaved,
  onGroupCreated,
}: {
  athleteId: string
  athleteLocationIds: string[]
  locations: { id: string; name: string }[]
  selectedIds: string[]
  allGroups: GroupOption[]
  isOpen: boolean
  onToggleOpen: () => void
  onSaved: (groupIds: string[]) => void
  onGroupCreated: (group: GroupOption) => void
}) {
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onToggleOpen()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onToggleOpen])

  // Fresh search each time the dropdown opens rather than leaving the last query behind.
  useEffect(() => {
    if (!isOpen) {
      setSearch('')
      setError('')
    }
  }, [isOpen])

  const multiLocation = athleteLocationIds.length > 1
  const displayName = (g: GroupOption) => (multiLocation ? `${g.name} · ${g.locationName}` : g.name)

  const available = allGroups.filter((g) => athleteLocationIds.includes(g.locationId))
  const names = allGroups.filter((g) => selectedIds.includes(g.id)).map(displayName)
  const label = names.length === 0 ? 'None' : names.join(', ')

  const query = search.trim().toLowerCase()
  const filtered = query ? available.filter((g) => displayName(g).toLowerCase().includes(query)) : available
  const athleteLocations = locations.filter((l) => athleteLocationIds.includes(l.id))
  // Offer "Create" at each of the athlete's locations that doesn't already have that name.
  const createTargets = query
    ? athleteLocations.filter((l) => !available.some((g) => g.locationId === l.id && g.name.toLowerCase() === query))
    : []

  async function toggle(groupId: string) {
    const next = selectedIds.includes(groupId)
      ? selectedIds.filter((id) => id !== groupId)
      : [...selectedIds, groupId]
    setSaving(true)
    setError('')
    const res = await updateAthleteGroupsAction({ athleteId, groupIds: next })
    setSaving(false)
    if (res.success) onSaved(next)
    else setError(res.error || 'Failed to update groups.')
  }

  // Falls back to creating a group named after the search text -- only offered when nothing
  // already matches, so this box reads as "search" by default rather than "create."
  async function handleCreate(locationId: string) {
    const name = search.trim()
    if (!name) return
    setSaving(true)
    const res = await createGroupAction({ name, locationId })
    if (res.success && res.group) {
      onGroupCreated(res.group)
      await toggle(res.group.id)
      setSearch('')
    } else {
      setError(res.error || 'Failed to create group.')
    }
    setSaving(false)
  }

  return (
    <div ref={boxRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggleOpen}
        disabled={saving}
        className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white transition disabled:opacity-50 max-w-[180px]"
      >
        <Users className="w-3 h-3 text-slate-500 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute left-0 z-30 mt-1 w-60 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-1.5 space-y-1">
          {athleteLocationIds.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-500">
              Assign this athlete a location first — groups belong to a location.
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search groups..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 pl-7 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {available.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-500">No groups at this athlete&apos;s location yet.</div>
                )}
                {available.length > 0 && filtered.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-500">No groups match &quot;{search.trim()}&quot;.</div>
                )}
                {filtered.map((g) => {
                  const checked = selectedIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggle(g.id)}
                      disabled={saving}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      <span className="truncate">{displayName(g)}</span>
                      {checked && <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    </button>
                  )
                })}
              </div>
              {createTargets.length > 0 && (
                <div className="border-t border-slate-800 pt-1 mt-1 space-y-0.5">
                  {createTargets.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleCreate(loc.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        Create &quot;{search.trim()}&quot;{multiLocation ? ` at ${loc.name}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {error && <div className="px-2 py-1 text-[11px] text-red-400">{error}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
