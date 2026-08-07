'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
      return
    }

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'coach' || profile?.role === 'admin') {
        router.push('/coach')
      } else if (profile?.role === 'parent') {
        router.push('/parent')
      } else {
        router.push('/athlete')
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/30 rounded-3xl p-8 shadow-2xl shadow-red-950/40 space-y-6">
        
        {/* GVN Branding Header */}
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
            Athlete Management System
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-extrabold py-3.5 rounded-xl transition shadow-lg shadow-red-900/30 text-sm mt-2 disabled:opacity-50 uppercase tracking-wider"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <Link
          href="/signup"
          className="block text-center text-xs text-slate-400 hover:text-white transition"
        >
          First time logging in? Set up your account
        </Link>
      </div>
    </main>
  )
}