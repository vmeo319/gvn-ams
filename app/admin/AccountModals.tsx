'use client'

import React, { useEffect, useState } from 'react'
import { X, Eye, EyeOff, AlertTriangle } from 'lucide-react'
import { setAccountLoginAction, getAccountDataSummaryAction, deleteAccountAction } from './actions'

export interface AccountRow {
  id: string
  first_name: string
  last_name: string
  role: string
  location_id: string | null
}

const fullName = (p: AccountRow) => `${p.first_name || ''} ${p.last_name || ''}`.trim()

type Summary = { testDays: number; groups: number; notes: number; hasLogin: boolean; email: string }

function useSummary(userId: string) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    getAccountDataSummaryAction({ userId }).then((res) => {
      if (cancelled) return
      if (res.success) setSummary(res)
      else setError(res.error || 'Could not load this account.')
    })
    return () => {
      cancelled = true
    }
  }, [userId])
  return { summary, error }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500'

export function EditLoginModal({ account, onClose, onSaved }: { account: AccountRow; onClose: () => void; onSaved: () => void }) {
  const { summary, error: loadError } = useSummary(account.id)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const currentEmail = summary?.email || ''
  const isPlaceholder = currentEmail.endsWith('@gvn-placeholder.com')

  async function save() {
    setError('')
    setSaving(true)
    const res = await setAccountLoginAction({ userId: account.id, email: email || undefined, password: password || undefined })
    setSaving(false)
    if (!res.success) {
      setError(res.error || 'Failed to update login.')
      return
    }
    setDone(true)
    onSaved()
  }

  return (
    <Modal title={`Edit login — ${fullName(account)}`} onClose={onClose}>
      <div className="text-xs text-slate-400">
        {!summary && !loadError && 'Loading...'}
        {loadError && <span className="text-red-400">{loadError}</span>}
        {summary &&
          (summary.hasLogin ? (
            <>
              Current login: <span className="text-slate-200">{currentEmail}</span>
              {isPlaceholder && <span className="text-amber-400"> (placeholder from imported data, not usable)</span>}
            </>
          ) : (
            'This account has no login yet. Enter an email and password to create one.'
          ))}
      </div>

      {done ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg border border-emerald-800 bg-emerald-950/40 text-xs text-emerald-300">
            Login updated. They can sign in with the new {email && password ? 'email and password' : email ? 'email' : 'password'} now.
          </div>
          <button onClick={onClose} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold py-2 rounded-lg">
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">New email (login username)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={summary?.hasLogin ? 'Leave blank to keep the current email' : 'name@example.com'}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">New password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={summary?.hasLogin ? 'Leave blank to keep the current password' : 'At least 8 characters'}
                autoComplete="new-password"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>}
          <button
            onClick={save}
            disabled={saving || !summary || (!email && !password)}
            className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save login'}
          </button>
        </>
      )}
    </Modal>
  )
}

export function DeleteAccountModal({
  account,
  allAccounts,
  onClose,
  onDeleted,
}: {
  account: AccountRow
  allAccounts: AccountRow[]
  onClose: () => void
  onDeleted: () => void
}) {
  const { summary, error: loadError } = useSummary(account.id)
  // Same-name accounts are the likely duplicates, so they're offered first.
  const sameName = allAccounts.filter(
    (a) => a.id !== account.id && fullName(a).toLowerCase() === fullName(account).toLowerCase()
  )
  const [mergeIntoId, setMergeIntoId] = useState(sameName[0]?.id || '')
  const [mergeSearch, setMergeSearch] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const hasData = !!summary && summary.testDays + summary.groups + summary.notes > 0
  const mergeTarget = allAccounts.find((a) => a.id === mergeIntoId)
  const candidates = [
    ...sameName,
    ...allAccounts.filter(
      (a) =>
        a.id !== account.id &&
        !sameName.includes(a) &&
        mergeSearch.trim().length >= 2 &&
        fullName(a).toLowerCase().includes(mergeSearch.trim().toLowerCase())
    ),
  ].slice(0, 20)
  // Deleting data for good needs the name typed out; a merge keeps the data, so it doesn't.
  const canDelete = !!summary && (mergeIntoId !== '' || !hasData || confirmText.trim().toLowerCase() === fullName(account).toLowerCase())

  async function remove() {
    setError('')
    setDeleting(true)
    const res = await deleteAccountAction({ userId: account.id, mergeIntoId: mergeIntoId || undefined })
    setDeleting(false)
    if (!res.success) {
      setError(res.error || 'Failed to delete account.')
      return
    }
    onDeleted()
    onClose()
  }

  return (
    <Modal title={`Delete account — ${fullName(account)}`} onClose={onClose}>
      {loadError && <div className="text-xs text-red-400">{loadError}</div>}
      {!summary && !loadError && <div className="text-xs text-slate-400">Loading...</div>}
      {summary && (
        <div className="text-xs text-slate-400 space-y-0.5">
          <div>
            Role: <span className="text-slate-200">{account.role}</span> · Login:{' '}
            <span className="text-slate-200">{summary.hasLogin ? summary.email : 'none'}</span>
          </div>
          <div>
            Data: <span className="text-slate-200">{summary.testDays}</span> test days ·{' '}
            <span className="text-slate-200">{summary.groups}</span> groups · <span className="text-slate-200">{summary.notes}</span> notes
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="radio" checked={mergeIntoId !== ''} onChange={() => setMergeIntoId(candidates[0]?.id || '')} disabled={candidates.length === 0 && mergeIntoId === ''} className="accent-red-600" />
          Move its data to another account first (duplicates)
        </label>
        <div className="pl-6 space-y-1.5">
          <input
            value={mergeSearch}
            onChange={(e) => setMergeSearch(e.target.value)}
            placeholder="Search for the account to keep"
            className={`${inputClass} text-xs py-1.5`}
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {candidates.map((a) => (
              <button
                key={a.id}
                onClick={() => setMergeIntoId(a.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs ${
                  a.id === mergeIntoId ? 'bg-red-600/20 text-white border border-red-700' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {fullName(a)} <span className="text-slate-500">· {a.role}</span>
                {sameName.includes(a) && <span className="text-amber-400"> · same name</span>}
              </button>
            ))}
            {candidates.length === 0 && <div className="text-[11px] text-slate-500 px-1">Type at least 2 letters to search.</div>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="radio" checked={mergeIntoId === ''} onChange={() => setMergeIntoId('')} className="accent-red-600" />
          Delete it and its data
        </label>
      </div>

      {mergeIntoId === '' && hasData && (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-800 bg-red-950/40 text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            This permanently deletes {summary?.testDays} test days and everything else on this account. Type{' '}
            <span className="font-semibold">{fullName(account)}</span> to confirm.
          </div>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} />
        </div>
      )}
      {mergeTarget && (
        <div className="text-xs text-slate-400">
          Its data moves to <span className="text-slate-200">{fullName(mergeTarget)} ({mergeTarget.role})</span>, then this account
          and its login are deleted.
        </div>
      )}

      {error && <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">{error}</div>}
      <button
        onClick={remove}
        disabled={deleting || !canDelete}
        className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-40"
      >
        {deleting ? 'Deleting...' : mergeIntoId ? 'Move data & delete account' : 'Delete account'}
      </button>
    </Modal>
  )
}
