'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Users, Check, ChevronDown, Plus } from 'lucide-react'
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
  const [newName, setNewName] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onToggleOpen()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onToggleOpen])

  const names = allGroups.filter((g) => selectedIds.includes(g.id)).map((g) => g.name)
  const label = names.length === 0 ? 'None' : names.join(', ')

  async function toggle(groupId: string) {
    const next = selectedIds.includes(groupId)
      ? selectedIds.filter((id) => id !== groupId)
      : [...selectedIds, groupId]
    setSaving(true)
    const res = await updateAthleteGroupsAction({ athleteId, groupIds: next })
    setSaving(false)
    if (res.success) onSaved(next)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const res = await createGroupAction({ name })
    if (res.success && res.group) {
      onGroupCreated(res.group)
      await toggle(res.group.id)
      setNewName('')
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
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-1.5 space-y-0.5">
          {allGroups.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-500">No groups yet — add one below.</div>
          )}
          {allGroups.map((g) => {
            const checked = selectedIds.includes(g.id)
            return (
              <button
                key={g.id}
                onClick={() => toggle(g.id)}
                disabled={saving}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
              >
                <span>{g.name}</span>
                {checked && <Check className="w-3.5 h-3.5 text-red-500" />}
              </button>
            )
          })}
          <form onSubmit={handleCreate} className="flex gap-1 pt-1 border-t border-slate-800 mt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New group..."
              className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="p-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
