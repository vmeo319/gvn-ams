'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

export default function CompleteInvite() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    const params = new URLSearchParams(hash)

    const hashError = params.get('error_description')
    if (hashError) {
      setErrorMsg(hashError.replace(/\+/g, ' '))
      setStatus('error')
      return
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setErrorMsg('This invite link is missing or malformed.')
      setStatus('error')
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      if (error) {
        setErrorMsg(error.message)
        setStatus('error')
      } else {
        setStatus('ready')
      }
    })
  }, [])

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setSubmitting(false)
      setErrorMsg(error.message)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    setSubmitting(false)

    if (!user) {
      router.push('/')
      return
    }

    // This invite link is reused for coach accounts now (created from /admin), not just
    // athletes — route by actual role instead of always assuming athlete.
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'coach' || profile?.role === 'admin') {
      router.push('/coach')
    } else {
      router.push('/athlete')
    }
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
          <p className="text-slate-400 text-xs tracking-wider uppercase pt-1">Activate Your Account</p>
        </div>

        {status === 'loading' && (
          <p className="text-center text-sm text-slate-400">Verifying your invite link...</p>
        )}

        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg || 'This invite link is invalid or has expired. Ask your coach to send a new one.'}
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <p className="text-slate-400 text-xs text-center leading-relaxed">
              Your coach already set up your profile. Choose a password to finish activating your account.
            </p>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
                {errorMsg}
              </div>
            )}

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

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm mt-2 disabled:opacity-50 uppercase tracking-wider"
            >
              {submitting ? 'Activating...' : 'Activate My Account'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
