'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { claimAthleteAccount } from './actions'

export default function SignUp() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setLoading(true)

    const res = await claimAthleteAccount({ firstName, lastName, email, password })

    if (!res.success) {
      setErrorMsg(res.error || 'Could not set up your account.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setErrorMsg('Account created — please log in from the sign in page.')
      router.push('/')
      return
    }

    router.push('/athlete')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/30 rounded-3xl p-8 shadow-2xl shadow-red-950/40 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-24 h-24 mb-1">
            <Image
              src="/gvn-logo-wolf.png"
              alt="GVN Wolf Logo"
              fill
              className="object-contain"
              priority
            />
          </div>

          <div className="relative w-48 h-10">
            <Image
              src="/gvn-logo-letters.png"
              alt="GVN Performance"
              fill
              className="object-contain"
              priority
            />
          </div>

          <p className="text-slate-400 text-xs tracking-wider uppercase pt-1">
            Set Up Your Athlete Account
          </p>
        </div>

        <p className="text-slate-400 text-xs text-center leading-relaxed">
          Your coach has already added your info to the system. Enter your name exactly as your
          coach has it, then choose an email and password to activate your account.
        </p>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Last Name</label>
              <input
                type="text"
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
              placeholder="athlete@gmail.com"
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
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm mt-2 disabled:opacity-50 uppercase tracking-wider"
          >
            {loading ? 'Setting Up Account...' : 'Activate My Account'}
          </button>
        </form>

        <Link
          href="/"
          className="block text-center text-xs text-slate-400 hover:text-white transition"
        >
          Already have a login? Sign in
        </Link>
      </div>
    </main>
  )
}
