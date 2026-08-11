'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { LogOut, Plus } from 'lucide-react'
import StationCard from './StationCard'

const STORAGE_KEY = 'gvn_station_athletes'
const MAX_CARDS = 5

export default function StationPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [athleteIds, setAthleteIds] = useState<string[]>([])

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'ipad') {
        router.push('/')
        return
      }
      setAuthorized(true)

      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        if (Array.isArray(stored)) setAthleteIds(stored)
      } catch (e) {
        // corrupt/absent local storage — start empty
      }
    }
    init()
  }, [router])

  function persist(ids: string[]) {
    setAthleteIds(ids)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }

  useEffect(() => {
    if (!searchOpen) return
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('role', 'athlete')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(15)
      setResults((data || []).map((p) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() })))
    }, 200)
    return () => clearTimeout(handle)
  }, [query, searchOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addAthlete(id: string) {
    if (athleteIds.includes(id)) {
      setSearchOpen(false)
      setQuery('')
      return
    }
    persist([...athleteIds, id])
    setSearchOpen(false)
    setQuery('')
  }

  function removeAthlete(id: string) {
    persist(athleteIds.filter((a) => a !== id))
  }

  if (!authorized) {
    return <div className="p-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div className="p-6 space-y-4 h-screen flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight uppercase">Weight Room Station</h1>
        <div className="flex items-center gap-3">
          <div ref={boxRef} className="relative">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              disabled={athleteIds.length >= MAX_CARDS}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-lg transition text-sm disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Athlete</span>
            </button>
            {searchOpen && (
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search athletes..."
                  className="w-full bg-slate-950 border-b border-slate-800 rounded-t-lg px-3 py-2 text-sm text-white focus:outline-none"
                />
                <div className="max-h-56 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => addAthlete(r.id)}
                      className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-lg border border-slate-800 transition text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {athleteIds.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          No athletes on this station yet. Tap "+ Athlete" to add up to {MAX_CARDS}.
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto flex-1">
        {athleteIds.map((id) => (
          <StationCard key={id} athleteId={id} onRemove={() => removeAthlete(id)} />
        ))}
      </div>
    </div>
  )
}
