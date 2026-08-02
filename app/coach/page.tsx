'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Search, FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createAthleteAction, uploadMetricRows } from './actions'

interface LeaderboardRecord {
  athlete_id: string
  first_name: string
  last_name: string
  birth_year: number
  position: string
  height_inches: number
  weight_lbs: number
  iso_rel_peak_force: number | null
  v0_speed: number | null
  top_speed: number | null
  max_jump: number | null
  workout_level: string
  sprint_level: string
}

export default function CoachDashboard() {
  const [data, setData] = useState<LeaderboardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  
  // Add Athlete Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    birthYear: 2006,
    position: 'Forward',
    heightInches: 72,
    weightLbs: 185,
  })
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Upload Metrics State
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ success?: boolean; msg: string; errors?: string[] } | null>(null)

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  const fetchLeaderboard = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('coach_365d_leaderboard')
      .select('*')

    if (error) {
      console.error('Error loading leaderboard:', error.message || error)
    } else {
      setData(records || [])
    }
    setLoading(false)
  }

  const handleCreateAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError('')
    setSubmitting(true)

    const res = await createAthleteAction(formData)

    if (!res.success) {
      setModalError(res.error || 'Failed to create athlete.')
      setSubmitting(false)
    } else {
      setSubmitting(false)
      setAddModalOpen(false)
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        birthYear: 2006,
        position: 'Forward',
        heightInches: 72,
        weightLbs: 185,
      })
      fetchLeaderboard()
    }
  }

  // Handle Excel File Parsing & Processing
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadStatus({ msg: 'Parsing file contents...' })

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = XLSX.utils.sheet_to_json(ws)

        if (!rawData || rawData.length === 0) {
          setUploadStatus({ success: false, msg: 'Excel sheet appears to be empty.' })
          setUploading(false)
          return
        }

        setUploadStatus({ msg: `Uploading ${rawData.length} entries to Supabase...` })

        const res = await uploadMetricRows(rawData)

        if (res.success) {
          setUploadStatus({
            success: true,
            msg: `Successfully imported ${res.insertedCount} record(s)!`,
            errors: res.errors
          })
          fetchLeaderboard()
        }
      } catch (err: any) {
        setUploadStatus({ success: false, msg: `Parsing error: ${err.message}` })
      } finally {
        setUploading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  // Generate & Download Pre-formatted Excel Template
  const downloadTemplate = () => {
    const templateData = [
      {
        'First Name': 'Connor',
        'Last Name': 'McDavid',
        'Test Date': '2026-08-01',
        'ISO Peak Force (N)': 4150,
        'V0 Speed': 18.2,
        'CMJ Height (in)': 24.5,
        'Broad Jump (in)': 114,
        'Bench Velo (m/s)': 1.25,
        'Chin-ups': 18,
        'Weight (lbs)': 195
      },
      {
        'First Name': 'Jack',
        'Last Name': 'Eichel',
        'Test Date': '2026-08-01',
        'ISO Peak Force (N)': 3800,
        'V0 Speed': 16.8,
        'CMJ Height (in)': 21.5,
        'Broad Jump (in)': 108,
        'Bench Velo (m/s)': 1.10,
        'Chin-ups': 15,
        'Weight (lbs)': 205
      }
    ]

    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Metrics Template')
    XLSX.writeFile(workbook, 'GVN_Metrics_Upload_Template.xlsx')
  }

  const filteredData = data.filter((a) =>
    `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center space-x-4">
            <img src="/gvn-logo-letters.png" alt="GVN Logo" className="h-10 w-auto" />
            <div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Coach Dashboard</h1>
              <p className="text-sm text-slate-400">GVN Performance • 365-Day Leaderboard & Metric Hub</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setUploadStatus(null)
                setUploadModalOpen(true)
              }}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-red-500" />
              <span>Import Data / Template</span>
            </button>
            <button
              onClick={() => {
                setModalError('')
                setAddModalOpen(true)
              }}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg transition shadow-lg shadow-red-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Athlete</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search athletes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
          />
        </div>

        {/* Leaderboard Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Athlete</th>
                  <th className="py-4 px-4">Pos</th>
                  <th className="py-4 px-4">Ht / Wt</th>
                  <th className="py-4 px-4">ISO Peak Force</th>
                  <th className="py-4 px-4">V0 Speed</th>
                  <th className="py-4 px-4">Max Jump</th>
                  <th className="py-4 px-4 text-center">Workout Level</th>
                  <th className="py-4 px-4 text-center">Sprint Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Loading GVN performance records...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No matching athletes found.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((a) => (
                    <tr key={a.athlete_id} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-6 font-semibold text-white">
                        {a.first_name} {a.last_name}
                      </td>
                      <td className="py-4 px-4 text-slate-400">{a.position}</td>
                      <td className="py-4 px-4 text-slate-400">
                        {a.height_inches ? `${a.height_inches}"` : '-'} / {a.weight_lbs ? `${a.weight_lbs} lbs` : '-'}
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-200">
                        {a.iso_rel_peak_force ? `${a.iso_rel_peak_force} N/kg` : '-'}
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-200">
                        {a.v0_speed ? `${a.v0_speed} m/s` : '-'}
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-200">
                        {a.max_jump ? `${a.max_jump}"` : '-'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          a.workout_level === 'Level 3'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {a.workout_level}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                          a.sprint_level === 'Level 2'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-slate-700/40 text-slate-400 border border-slate-700/50'
                        }`}>
                          {a.sprint_level}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL 1: ADD ATHLETE */}
        {addModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Add New Athlete</h3>
                <p className="text-xs text-slate-400 mt-1">Create a profile for leaderboards & individual trendlines.</p>
              </div>

              {modalError && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateAthlete} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">First Name</label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Last Name</label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="athlete@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Temporary Password</label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Position</label>
                    <select
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="Forward">Forward</option>
                      <option value="Defense">Defense</option>
                      <option value="Goalie">Goalie</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Birth Year</label>
                    <input
                      type="number"
                      value={formData.birthYear}
                      onChange={(e) => setFormData({ ...formData, birthYear: Number(e.target.value) })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Height (inches)</label>
                    <input
                      type="number"
                      value={formData.heightInches}
                      onChange={(e) => setFormData({ ...formData, heightInches: Number(e.target.value) })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Weight (lbs)</label>
                    <input
                      type="number"
                      value={formData.weightLbs}
                      onChange={(e) => setFormData({ ...formData, weightLbs: Number(e.target.value) })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
                  >
                    {submitting ? 'Saving...' : 'Save Athlete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: UPLOAD DATA / DOWNLOAD TEMPLATE */}
        {uploadModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white">Import Metrics & Field Tests</h3>
                  <p className="text-xs text-slate-400 mt-1">Upload Hawkins, 1080 Sprint, or manual Excel files.</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center space-x-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/50 border border-red-800/60 px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
              </div>

              {/* Status Notifications */}
              {uploadStatus && (
                <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                  uploadStatus.success === true
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : uploadStatus.success === false
                    ? 'bg-red-950/40 border-red-800 text-red-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}>
                  <div className="flex items-center space-x-2 font-medium">
                    {uploadStatus.success === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{uploadStatus.msg}</span>
                  </div>
                  {uploadStatus.errors && uploadStatus.errors.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                      {uploadStatus.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-700 hover:border-red-500 rounded-xl p-8 text-center bg-slate-950/40 transition group cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-3 bg-slate-800 rounded-full group-hover:bg-red-950/60 transition">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {uploading ? 'Processing file...' : 'Click or drag file to upload'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Supports .xlsx, .xls, or .csv formats</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-[11px] text-slate-500">Matches rows by First Name + Last Name</span>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}