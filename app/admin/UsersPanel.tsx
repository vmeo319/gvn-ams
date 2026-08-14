'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Search, Copy, KeyRound, MapPin, Check, ChevronDown } from 'lucide-react'
import { updateUserRoleAction, sendPasswordResetLinkAction, updateProfileLocationsAction } from './actions'

interface ProfileRow {
  id: string
  first_name: string
  last_name: string
  email: string | null
  role: string
  location_id: string | null
}

interface LocationRow {
  id: string
  name: string
}

const ROLE_OPTIONS = ['athlete', 'coach', 'admin', 'parent', 'pending', 'ipad']

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-400 border-red-500/20',
  coach: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  parent: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  athlete: 'bg-slate-800 text-slate-300 border-slate-700',
  pending: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ipad: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

function LocationCell({
  profileId,
  selectedIds,
  allLocations,
  isOpen,
  onToggleOpen,
  onSaved,
}: {
  profileId: string
  selectedIds: string[]
  allLocations: LocationRow[]
  isOpen: boolean
  onToggleOpen: () => void
  onSaved: (locationIds: string[]) => void
}) {
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onToggleOpen()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onToggleOpen])

  const names = allLocations.filter((l) => selectedIds.includes(l.id)).map((l) => l.name)
  const label = names.length === 0 ? 'None' : names.join(', ')

  async function toggle(locationId: string) {
    const next = selectedIds.includes(locationId)
      ? selectedIds.filter((id) => id !== locationId)
      : [...selectedIds, locationId]
    setSaving(true)
    const res = await updateProfileLocationsAction({ profileId, locationIds: next })
    setSaving(false)
    if (res.success) onSaved(next)
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={onToggleOpen}
        disabled={saving}
        className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white transition disabled:opacity-50 max-w-[180px]"
      >
        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute left-0 z-30 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl p-1.5 space-y-0.5">
          {allLocations.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-slate-500">No locations yet — add one below.</div>
          )}
          {allLocations.map((loc) => {
            const checked = selectedIds.includes(loc.id)
            return (
              <button
                key={loc.id}
                onClick={() => toggle(loc.id)}
                disabled={saving}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
              >
                <span>{loc.name}</span>
                {checked && <Check className="w-3.5 h-3.5 text-red-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function UsersPanel({ selfId }: { selfId: string }) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [locationsByProfile, setLocationsByProfile] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openLocationRowId, setOpenLocationRowId] = useState<string | null>(null)
  const [resetLink, setResetLink] = useState<{ name: string; link: string } | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: profileRows }, { data: locRows }, { data: linkRows }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name, email, role, location_id').order('first_name'),
      supabase.from('locations').select('id, name').order('name'),
      supabase.from('athlete_locations').select('profile_id, location_id'),
    ])
    setProfiles((profileRows || []) as ProfileRow[])
    setLocations((locRows || []) as LocationRow[])

    // athlete_locations only tracks explicitly-assigned extras — a profile that's never had
    // its locations edited yet still has a single primary location_id, so fall back to that
    // rather than showing "None" for every account that predates this feature.
    const map: Record<string, string[]> = {}
    ;(profileRows || []).forEach((p: any) => {
      if (p.location_id) map[p.id] = [p.location_id]
    })
    ;(linkRows || []).forEach((row: any) => {
      map[row.profile_id] = map[row.profile_id] || []
      if (!map[row.profile_id].includes(row.location_id)) map[row.profile_id].push(row.location_id)
    })
    setLocationsByProfile(map)

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = profiles.filter((p) => {
    const nameMatch = `${p.first_name} ${p.last_name} ${p.email || ''}`.toLowerCase().includes(search.toLowerCase())
    const roleMatch = !roleFilter || p.role === roleFilter
    return nameMatch && roleMatch
  })

  async function handleRoleChange(userId: string, newRole: string) {
    setError('')
    setBusyId(userId)
    const res = await updateUserRoleAction({ userId, newRole, actingAdminId: selfId })
    setBusyId(null)
    if (!res.success) {
      setError(res.error || 'Failed to update role.')
      return
    }
    await load()
  }

  async function handleResetPassword(p: ProfileRow) {
    setError('')
    setBusyId(p.id)
    const res = await sendPasswordResetLinkAction({ userId: p.id })
    setBusyId(null)
    if (!res.success || !res.resetLink) {
      setError(res.error || 'Failed to generate reset link.')
      return
    }
    setResetLink({ name: `${p.first_name} ${p.last_name}`.trim(), link: res.resetLink })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>
      )}

      {resetLink && (
        <div className="p-4 rounded-xl border border-emerald-800 bg-emerald-950/40 space-y-2">
          <div className="text-xs font-semibold text-emerald-300">
            Password reset link for {resetLink.name}
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={resetLink.link}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(resetLink.link)}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 rounded-lg text-xs font-semibold text-slate-200 transition shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-[11px] text-slate-500">Send this to them yourself — it lets them set a new password.</p>
            <button onClick={() => setResetLink(null)} className="text-[11px] font-semibold text-slate-500 hover:text-white transition">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-5">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Location(s)</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {loading ? (
                <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading accounts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-slate-500">No matching accounts.</td></tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-5 font-semibold text-white">
                      {p.role === 'athlete' || p.role === 'coach' || p.role === 'admin' ? (
                        <Link href={`/coach/athlete/${p.id}`} className="hover:underline">
                          {p.first_name} {p.last_name}
                        </Link>
                      ) : (
                        <span>{p.first_name} {p.last_name}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{p.email || '-'}</td>
                    <td className="py-3 px-4">
                      <LocationCell
                        profileId={p.id}
                        selectedIds={locationsByProfile[p.id] || []}
                        allLocations={locations}
                        isOpen={openLocationRowId === p.id}
                        onToggleOpen={() => setOpenLocationRowId((cur) => (cur === p.id ? null : p.id))}
                        onSaved={(ids) => setLocationsByProfile((prev) => ({ ...prev, [p.id]: ids }))}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={p.role}
                        disabled={busyId === p.id}
                        onChange={(e) => handleRoleChange(p.id, e.target.value)}
                        className={`text-xs font-semibold rounded-full px-2.5 py-1 border focus:outline-none disabled:opacity-50 ${ROLE_BADGE_STYLES[p.role] || 'bg-slate-800 text-slate-300 border-slate-700'}`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r} className="bg-slate-900 text-slate-200">{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleResetPassword(p)}
                        disabled={busyId === p.id}
                        title="Generate a password reset link"
                        className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Reset Password</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
