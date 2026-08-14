'use client'

import React, { useState } from 'react'
import { Copy, UserPlus } from 'lucide-react'
import { createCoachAccountAction } from './actions'

export default function CreateCoachPanel({ onCreated }: { onCreated: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const res = await createCoachAccountAction({ firstName, lastName, email })
    setSubmitting(false)
    if (!res.success) {
      setError(res.error || 'Failed to create coach account.')
      return
    }
    setInviteLink(res.inviteLink || '')
    onCreated()
  }

  function reset() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setInviteLink('')
    setError('')
  }

  return (
    <div className="p-5 rounded-xl border border-slate-800 bg-slate-900 space-y-4">
      <div className="flex items-center space-x-2">
        <UserPlus className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Create Coach Account</h3>
      </div>

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>
      )}

      {inviteLink ? (
        <div className="space-y-3">
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300">
            Coach account created — share this link to let them set their own password.
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 rounded-lg text-xs font-semibold text-slate-200 transition shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>
          </div>
          <button
            onClick={reset}
            className="text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            + Create another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Email</label>
            <input
              type="email"
              required
              placeholder="coach@gvn.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create & Generate Invite Link'}
          </button>
        </form>
      )}
    </div>
  )
}
