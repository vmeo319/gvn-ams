'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { addAthleteNoteAction } from '@/app/coach/actions'
import { StickyNote, HeartPulse, Target } from 'lucide-react'

type EntryType = 'note' | 'injury' | 'goal'

interface NoteRow {
  id: string
  entry_type: EntryType
  body: string
  author_id: string
  created_at: string
}

const TYPE_STYLE: Record<EntryType, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  note: { label: 'Note', color: '#93c5fd', bg: 'bg-blue-950/30 border-blue-900', icon: StickyNote },
  injury: { label: 'Injury', color: '#fca5a5', bg: 'bg-red-950/30 border-red-900', icon: HeartPulse },
  goal: { label: 'Goal', color: '#86efac', bg: 'bg-emerald-950/30 border-emerald-900', icon: Target },
}

export default function AthleteNotesPanel({ athleteId, authorId }: { athleteId: string; authorId: string }) {
  const [entries, setEntries] = useState<NoteRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [entryType, setEntryType] = useState<EntryType>('note')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase
      .from('athlete_notes')
      .select('id, entry_type, body, author_id, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })

    const rows = (data || []) as NoteRow[]
    setEntries(rows)

    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)))
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', authorIds)
      const names: Record<string, string> = {}
      ;(authors || []).forEach((a: any) => {
        names[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim()
      })
      setAuthorNames(names)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadEntries()
  }, [athleteId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    await addAthleteNoteAction({ athleteId, authorId, entryType, body: body.trim() })
    setBody('')
    setSubmitting(false)
    await loadEntries()
  }

  return (
    <div className="p-6 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <h2 className="text-lg font-semibold">Notes, Injuries &amp; Goals</h2>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          {(['note', 'injury', 'goal'] as EntryType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setEntryType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                entryType === t ? TYPE_STYLE[t].bg : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              {TYPE_STYLE[t].label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Add a ${entryType}...`}
          rows={2}
          className="w-full rounded-lg bg-slate-950 border border-slate-800 p-3 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {submitting ? 'Adding...' : 'Add Entry'}
        </button>
      </form>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {loading && <div className="text-sm text-slate-500">Loading...</div>}
        {!loading && entries.length === 0 && (
          <div className="text-sm text-slate-500">No entries yet.</div>
        )}
        {entries.map((entry) => {
          const style = TYPE_STYLE[entry.entry_type]
          const Icon = style.icon
          return (
            <div key={entry.id} className={`p-3 rounded-lg border ${style.bg}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: style.color }}>
                  <Icon className="w-3.5 h-3.5" />
                  {style.label}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {authorNames[entry.author_id] ? ` · ${authorNames[entry.author_id]}` : ''}
                </div>
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{entry.body}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
