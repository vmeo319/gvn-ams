'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

export default function PendingApproval() {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/30 rounded-3xl p-8 shadow-2xl shadow-red-950/40 space-y-6 text-center">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-24 h-24 mb-1">
            <Image src="/gvn-logo-wolf.png" alt="GVN Wolf Logo" fill className="object-contain" priority />
          </div>
          <div className="relative w-48 h-10">
            <Image src="/gvn-logo-letters.png" alt="GVN Performance" fill className="object-contain" priority />
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm p-4 rounded-xl">
          Your account request is awaiting coach approval. Check back once a coach has reviewed it.
        </div>

        <button
          onClick={handleSignOut}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl transition text-sm"
        >
          Sign Out
        </button>
      </div>
    </main>
  )
}
