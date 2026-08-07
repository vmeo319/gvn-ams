'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { getParentInviteInfoAction, claimParentInviteAction } from '../actions'

type Mode = 'loading' | 'confirm-existing-session' | 'sign-up' | 'sign-in' | 'invalid' | 'claiming' | 'done'

export default function ParentInvitePage() {
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const token = params.token

  const [mode, setMode] = useState<Mode>('loading')
  const [athleteName, setAthleteName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    async function init() {
      const info = await getParentInviteInfoAction(token)
      if (!info.success) {
        setErrorMsg(info.error || 'Invite not found.')
        setMode('invalid')
        return
      }
      if (info.status !== 'pending') {
        setErrorMsg(
          info.status === 'expired'
            ? 'This invite link has expired. Ask your coach to send a new one.'
            : 'This invite link has already been used.'
        )
        setMode('invalid')
        return
      }
      setAthleteName(info.athleteName || 'this athlete')

      const { data: { user } } = await supabase.auth.getUser()
      setMode(user ? 'confirm-existing-session' : 'sign-up')
    }
    init()
  }, [token])

  async function handleConfirmExistingSession() {
    setMode('claiming')
    setErrorMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setMode('sign-up')
      return
    }
    const result = await claimParentInviteAction({ token, accessToken: session.access_token })
    if (!result.success) {
      setErrorMsg(result.error || 'Something went wrong.')
      setMode('confirm-existing-session')
      return
    }
    setMode('done')
    router.push('/parent')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 6) {
      setErrorMsg('Please fill in every field — password must be at least 6 characters.')
      return
    }
    setMode('claiming')
    const result = await claimParentInviteAction({
      token,
      newAccount: { firstName, lastName, email, password },
    })
    if (!result.success) {
      setErrorMsg(result.error || 'Something went wrong.')
      setMode('sign-up')
      return
    }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      setErrorMsg('Account created, but automatic sign-in failed — please sign in manually.')
      setMode('sign-in')
      return
    }
    setMode('done')
    router.push('/parent')
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setMode('claiming')
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      setErrorMsg(signInErr.message)
      setMode('sign-in')
      return
    }
    await handleConfirmExistingSession()
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/30 rounded-3xl p-8 shadow-2xl shadow-red-950/40 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-24 h-24 mb-1">
            <Image src="/gvn-logo-wolf.png" alt="GVN Wolf Logo" fill className="object-contain" priority />
          </div>
          <div className="relative w-48 h-10">
            <Image src="/gvn-logo-letters.png" alt="GVN Performance" fill className="object-contain" priority />
          </div>
          <p className="text-slate-400 text-xs tracking-wider uppercase pt-1">Parent Account</p>
        </div>

        {mode === 'loading' && <p className="text-center text-sm text-slate-400">Checking your invite...</p>}
        {mode === 'claiming' && <p className="text-center text-sm text-slate-400">Linking your account...</p>}

        {mode === 'invalid' && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        {mode === 'confirm-existing-session' && (
          <div className="space-y-4 text-center">
            <p className="text-slate-300 text-sm">
              Link your account as a parent of <span className="font-bold">{athleteName}</span>?
            </p>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl font-medium">
                {errorMsg}
              </div>
            )}
            <button
              onClick={handleConfirmExistingSession}
              className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm uppercase tracking-wider"
            >
              Confirm
            </button>
          </div>
        )}

        {mode === 'sign-up' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <p className="text-slate-400 text-xs text-center leading-relaxed">
              Set up your parent account to view <span className="font-bold">{athleteName}</span>&apos;s dashboard.
            </p>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">First Name</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Last Name</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm mt-2 uppercase tracking-wider"
            >
              Create Parent Account
            </button>
            <p className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('sign-in')} className="text-red-400 hover:text-red-300 font-semibold">
                Sign in instead
              </button>
            </p>
          </form>
        )}

        {mode === 'sign-in' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <p className="text-slate-400 text-xs text-center leading-relaxed">
              Sign in to link <span className="font-bold">{athleteName}</span> to your existing parent account.
            </p>
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
                {errorMsg}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm mt-2 uppercase tracking-wider"
            >
              Sign In &amp; Link
            </button>
            <p className="text-center text-xs text-slate-500">
              <button type="button" onClick={() => setMode('sign-up')} className="text-red-400 hover:text-red-300 font-semibold">
                Back to account setup
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
