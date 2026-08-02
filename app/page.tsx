import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-6">
        
        {/* Brand Badge */}
        <div className="inline-block bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider text-cyan-400 uppercase">
          GVN Performance AMS
        </div>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight">
          ATHLETE MANAGEMENT SYSTEM
        </h1>

        <p className="text-slate-400 text-sm md:text-base max-w-md mx-auto">
          High-performance athlete tracking across all GVN facilities. Force plate analysis, 1080 speed profiling, and custom tier metrics.
        </p>

        {/* Navigation Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/coach" 
            className="px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl transition shadow-lg shadow-cyan-500/20 text-center"
          >
            Coach Leaderboard View →
          </Link>
        </div>

      </div>
    </main>
  )
}