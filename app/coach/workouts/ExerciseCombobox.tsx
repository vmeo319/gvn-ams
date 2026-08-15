'use client'

import React, { useEffect, useRef, useState } from 'react'
import { searchExerciseLibrary, createLibraryExercise } from './actions'

export default function ExerciseCombobox({
  value,
  onCommit,
  locationId,
}: {
  value: string
  onCommit: (name: string) => void
  locationId: string | null
}) {
  const [text, setText] = useState(value)
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => setText(value), [value])

  useEffect(() => {
    if (!open || !locationId) return
    const handle = setTimeout(async () => {
      const res = await searchExerciseLibrary(text, locationId)
      if (res.success) setResults(res.results)
    }, 200)
    return () => clearTimeout(handle)
  }, [text, open, locationId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function commit(name: string) {
    const clean = name.trim()
    setText(clean)
    setOpen(false)
    if (!clean) return
    if (clean !== value) {
      if (locationId) await createLibraryExercise({ name: clean, locationId })
      onCommit(clean)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="Search or add exercise..."
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-600"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(r.name)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              {r.name}
            </button>
          ))}
          {text.trim() && !results.some((r) => r.name.toLowerCase() === text.trim().toLowerCase()) && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(text)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-slate-800 border-t border-slate-800"
            >
              + Add "{text.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
