'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Users, Check, ChevronDown, Plus, Search } from 'lucide-react'
import { updateAthleteGroupsAction, createGroupAction } from './actions'

export interface GroupOption {
  id: string
  name: string
}

export default function GroupCell({
  athleteId,
  selectedIds,
  allGroups,
  isOpen,
  onToggleOpen,
  onSaved,
  onGroupCreated,
}: {
  athleteId: string
  selectedIds: string[]
  allGroups: GroupOption[]
  isOpen: boolean
  onToggleOpen: () => void
  onSaved: (groupIds: string[]) => void
  onGroupCreated: (group: GroupOption) => void
}) {
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
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
    if (!isOpen) setSearch('')
  }, [isOpen])

  const names = allGroups.filter((g) => selectedIds.includes(g.id)).map((g) => g.name)
  const label = names.length === 0 ? 'None' : names.join(', ')

  const query = search.trim().toLowerCase()
  const filtered = query ? allGroups.filter((g) => g.name.toLowerCase().includes(query)) : allGroups
  const exactMatch = allGroups.some((g) => g.name.toLowerCase() === query)

  async function toggle(groupId: string) {
    const next = selectedIds.includes(groupId)
      ? selectedIds.filter((id) => id !== groupId)
      : [...selectedIds, groupId]
    setSaving(true)
    const res = await updateAthleteGroupsAction({ athleteId, groupIds: next })
    setSaving(false)
    if (res.success) onSaved(next)
  }

  // Falls back to creating a group named after the search text -- only offered when nothing
  // already matches, so this box reads as "search" by default rather than "create."
  async function handleCreate() {
    const name = search.trim()
    if (!name) return
    setSaving(true)
    const res = await createGroupAction({ name })
    if (res.success && res.group) {
      onGroupCreated(res.group)
      await toggle(res.group.id)
      setSearch('')
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
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-1.5 space-y-1">
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
            {allGroups.length === 0 && <div className="px-2 py-1.5 text-xs text-slate-500">No groups yet.</div>}
            {allGroups.length > 0 && filtered.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-slate-500">No groups match "{search.trim()}".</div>
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
                  <span className="truncate">{g.name}</span>
                  {checked && <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                </button>
              )
            })}
          </div>
          {query && !exactMatch && (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-slate-800 transition disabled:opacity-50 border-t border-slate-800 pt-1.5 mt-1"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Create "{search.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
