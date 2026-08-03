'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Search, FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2, Zap, MapPin, Check } from 'lucide-react'
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
  location?: string | null
}

const GVN_LOCATIONS = [
  'GVN- Chicago',
  'GVN- North Shore',
  'GVN- Michigan',
  'GVN- FVIA',
]

// Official GVN North Shore Roster Array
const NORTH_SHORE_ROSTER = [
  'Robby Drazner', 'Emily Brown', 'Lyndie Lobdell', 'Brooke Hobson', 'Max Itigaki',
  'Will Winemaster', 'Lachlan Getz', 'Dom Rivelli', 'Mike DeAngelo', 'Jack Silich',
  'Grayden Daul', 'Mikey Burchill', 'David Deputy', 'Ben Motew', 'Tyler Carpenter',
  'Hugh McGing', 'Nick Nardella', 'Jack Devine', 'Dean Andrews', 'Josh LaChapelle',
  'Connor Bewick', 'Nolan Shorter', 'Nick Kempf', 'Trevor Shorter', 'Eero Butella',
  'Charlie Spencer', 'Evan Stasny', 'Charlie Campbell', 'Audrey Hetman', 'Arissa Vettraino',
  'Abby Sandler', 'Grant Dillard', 'Jack Hextall', 'Ryan Drury', 'Kristian Epperson',
  'Drew Daley', 'Shea Henriksen', 'Mason Minsky', 'Maclean Cooney', 'Malone Cooney',
  'Nate Jastrzebski', 'Ryker Lee', 'Chase Jette', 'Nathan Hauad', 'Cole Mckinney',
  'Oliver Mckinney', 'Nick Knutson', 'Sam Kapotas', 'Jimmy Rieber', 'Andrew Horn',
  'Thaddeus McMahon', 'Talen Aling', 'Emery Ipsen', 'Travis Lefere', 'Ryan Hecker',
  'Parker Cha', 'Harry Byers', 'Luke Assi', 'Abe Barnett', 'Josh Zitzman',
  'Anton Gesink', 'Jackson Romanoff', 'Ronan Freeman', 'Levi Freeman', 'Luca Kummetz',
  'AJ Haas', 'Will Johnston', 'Alex Milojevic', 'Tyler Cooper', 'Conner Cooper',
  'Alex Felts', 'Lukie Lincoln', 'Tyler Costescu', 'David Blasiak', 'George Golden',
  'Dillon Gesink', 'Emma Pape', 'Jameson Downs', 'Louis-Phillippe Delcourt', 'John Rappel',
  'Zach Ayyad', 'Conrad Siavelis', 'Bowen Domaleski', 'Joseph Krausfeldt', 'Jayden Finke',
  'Cash Cieslak', 'Matthew Cudio', 'Gavin Gu', 'Kenneth Kim', 'Ari Drivas',
  'Rylan Axe'
]

const NICKNAME_MAP: Record<string, string[]> = {
  ken: ['kenneth', 'kenny', 'ken'],
  kenny: ['kenneth', 'ken', 'kenny'],
  kenneth: ['kenny', 'ken', 'kenneth'],
  nick: ['nicholas', 'nick', 'nicky', 'nico'],
  nicholas: ['nick', 'nicky', 'nicholas', 'nico'],
  josh: ['joshua', 'josh'],
  joshua: ['josh', 'joshua'],
  mikey: ['michael', 'mike', 'mikey'],
  mike: ['michael', 'mike', 'mikey'],
  michael: ['mikey', 'mike', 'michael'],
  robby: ['robert', 'rob', 'bob', 'robby'],
  robert: ['robby', 'rob', 'bob', 'robert'],
  joe: ['joseph', 'joe', 'joey'],
  joey: ['joseph', 'joe', 'joey'],
  joseph: ['joe', 'joey', 'joseph'],
  tom: ['thomas', 'tom', 'tommy'],
  tommy: ['thomas', 'tom', 'tommy'],
  thomas: ['tom', 'tommy', 'thomas'],
  jimmy: ['james', 'jim', 'jimmy'],
  jim: ['james', 'jimmy', 'jim'],
  james: ['jimmy', 'jim', 'james'],
  alex: ['alexander', 'alex', 'alec'],
  alexander: ['alex', 'alec', 'alexander'],
  cam: ['cameron', 'cam'],
  cameron: ['cam', 'cameron'],
  chris: ['christopher', 'chris'],
  christopher: ['chris', 'christopher'],
  matt: ['matthew', 'matt'],
  matthew: ['matt', 'matthew'],
  dan: ['daniel', 'danny', 'dan'],
  danny: ['daniel', 'dan', 'danny'],
  daniel: ['dan', 'danny', 'daniel'],
  dave: ['david', 'dave'],
  david: ['dave', 'david'],
  will: ['william', 'will', 'bill', 'billy'],
  william: ['will', 'bill', 'billy', 'william'],
  ben: ['benjamin', 'ben', 'benny'],
  benjamin: ['ben', 'benny', 'benjamin'],
  zach: ['zachary', 'zach', 'zack'],
  zack: ['zachary', 'zach', 'zack'],
  zachary: ['zach', 'zack', 'zachary'],
  dom: ['dominic', 'dominick', 'dom'],
  dominic: ['dom', 'dominic'],
  dominick: ['dom', 'dominick'],
  nate: ['nathan', 'nathaniel', 'nate'],
  nathan: ['nate', 'nathan'],
  nathaniel: ['nate', 'nathaniel'],
  jake: ['jacob', 'jake'],
  jacob: ['jake', 'jacob'],
  sam: ['samuel', 'sam', 'sammy'],
  samuel: ['sam', 'sammy', 'samuel'],
  gabe: ['gabriel', 'gabe'],
  gabriel: ['gabe', 'gabriel'],
  drew: ['andrew', 'drew', 'andy'],
  andrew: ['drew', 'andy', 'andrew'],
  luke: ['lucas', 'luke', 'lukie'],
  lukie: ['luke', 'lucas', 'lukie'],
  lucas: ['luke', 'lukie', 'lucas'],
  aj: ['a.j.', 'aj', 'anthony'],
  'a.j.': ['aj', 'a.j.', 'anthony'],
  conner: ['connor', 'conner'],
  connor: ['conner', 'connor'],
}

// Format Excel dates
const formatExcelDate = (val: any): string => {
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000))
    return dateObj.toISOString().split('T')[0]
  }
  if (!val) return new Date().toISOString().split('T')[0]
  const str = String(val).trim()
  if (!isNaN(Number(str)) && Number(str) > 30000) {
    const dateObj = new Date(Math.round((Number(str) - 25569) * 86400 * 1000))
    return dateObj.toISOString().split('T')[0]
  }
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  return str.split('T')[0].split(' ')[0]
}

export default function CoachDashboard() {
  const [data, setData] = useState<LeaderboardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [ten80ModalOpen, setTen80ModalOpen] = useState(false)

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
    location: 'GVN- North Shore',
  })
  const [modalError, setModalError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Upload Metrics State
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ success?: boolean; msg: string; errors?: string[] } | null>(null)

  // 1080 Upload State
  const [ten80Uploading, setTen80Uploading] = useState(false)
  const [ten80Logs, setTen80Logs] = useState<string[]>([])
  const [ten80Status, setTen80Status] = useState<{ success?: boolean; msg: string } | null>(null)

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
      // Map roster list to GVN- North Shore
      const mappedRecords = (records || []).map((r) => {
        const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim().toLowerCase()
        const isNorthShore = NORTH_SHORE_ROSTER.some((nsName) => {
          const nsClean = nsName.trim().toLowerCase()
          return (
            fullName === nsClean ||
            fullName.includes(nsClean) ||
            nsClean.includes(fullName)
          )
        })
        return {
          ...r,
          location: r.location || (isNorthShore ? 'GVN- North Shore' : 'GVN- Chicago'),
        }
      })
      setData(mappedRecords)
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
        location: 'GVN- North Shore',
      })
      fetchLeaderboard()
    }
  }

  const toggleLocationSelect = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter((l) => l !== loc))
    } else {
      setSelectedLocations([...selectedLocations, loc])
    }
  }

  // Robust 1080 Export Processor
  const handle1080FileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setTen80Uploading(true)
    setTen80Logs(['Reading 1080 Motion file...'])
    setTen80Status(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result
        const wb = XLSX.read(buffer, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

        if (!rawData || rawData.length === 0) {
          setTen80Status({ success: false, msg: 'File is empty or unreadable.' })
          setTen80Uploading(false)
          return
        }

        setTen80Logs((prev) => [...prev, `Loaded ${rawData.length} rows from file.`])

        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')

        if (pErr) throw new Error(`Profiles fetch failed: ${pErr.message}`)

        setTen80Logs((prev) => [...prev, `Loaded ${profiles?.length || 0} athlete profiles for matching.`])

        const athleteSessions: Record<
          string,
          { athleteId: string; date: string; isV0: boolean; is10Yd: boolean; reps: { load: number; speed: number }[] }
        > = {}

        const MPS_TO_MPH = 2.23694
        let totalMatchedReps = 0
        const unmatchedNameSet = new Set<string>()

        rawData.forEach((row) => {
          const normalizedRow: Record<string, any> = {}
          Object.keys(row).forEach((k) => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '')
            normalizedRow[cleanKey] = row[k]
          })

          const rawName = String(
            normalizedRow['client'] ||
            normalizedRow['username'] ||
            normalizedRow['name'] ||
            normalizedRow['athlete'] ||
            normalizedRow['clientname'] ||
            ''
          )

          if (!rawName) return

          const cleanRaw = rawName.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
          const parts = cleanRaw.split(' ')
          let rowFirst = parts[0] || cleanRaw
          let rowLast = parts.length >= 2 ? parts[parts.length - 1] : cleanRaw

          let matchedProfileId: string | null = null

          if (profiles) {
            for (const p of profiles) {
              if (!p.first_name || !p.last_name) continue
              const pf = p.first_name.trim().toLowerCase()
              const pl = p.last_name.trim().toLowerCase()

              if (
                cleanRaw === `${pf} ${pl}` ||
                cleanRaw === `${pl} ${pf}` ||
                (rowFirst === pf && rowLast === pl) ||
                (rowFirst === pl && rowLast === pf)
              ) {
                matchedProfileId = p.id
                break
              }
            }

            if (!matchedProfileId) {
              for (const p of profiles) {
                if (!p.first_name || !p.last_name) continue
                const pf = p.first_name.trim().toLowerCase()
                const pl = p.last_name.trim().toLowerCase()

                const sameLast = rowLast === pl || rowFirst === pl || cleanRaw.includes(pl)
                if (!sameLast) continue

                const isPrefix = pf.startsWith(rowFirst) || rowFirst.startsWith(pf)
                const nickList = NICKNAME_MAP[rowFirst] || []
                const isNick = nickList.includes(pf)
                const firstLetterMatch = pf[0] === rowFirst[0]

                if (isPrefix || isNick || firstLetterMatch) {
                  matchedProfileId = p.id
                  break
                }
              }
            }
          }

          if (!matchedProfileId) {
            unmatchedNameSet.add(rawName.trim())
            return
          }

          const exName = String(
            normalizedRow['exercise'] ||
            normalizedRow['exercisename'] ||
            normalizedRow['exercisetypename'] ||
            ''
          ).toLowerCase()

          const loadKg = parseFloat(
            String(
              normalizedRow['concentricloadkg'] ||
              normalizedRow['concentricload'] ||
              normalizedRow['loadkg'] ||
              normalizedRow['load'] ||
              normalizedRow['externalloadkg'] ||
              '2.0'
            )
          )

          const speedMps = parseFloat(
            String(
              normalizedRow['topspeed'] ||
              normalizedRow['speedpeakms'] ||
              normalizedRow['peakspeedms'] ||
              normalizedRow['speedmaxms'] ||
              normalizedRow['speed'] ||
              '0'
            )
          )

          const rawDate =
            normalizedRow['sessiontime'] ||
            normalizedRow['settime'] ||
            normalizedRow['reptime'] ||
            normalizedRow['date'] ||
            normalizedRow['created']

          const dateStr = formatExcelDate(rawDate)

          if (speedMps <= 0) return

          const isV0 = exName.includes('sprint') || exName.includes('profiling') || exName.includes('v0')
          const is10Yd = exName.includes('10yd') || exName.includes('10yard')

          if (!isV0 && !is10Yd) return

          const sessionKey = `${matchedProfileId}_${dateStr}_${isV0 ? 'v0' : '10yd'}`

          if (!athleteSessions[sessionKey]) {
            athleteSessions[sessionKey] = {
              athleteId: matchedProfileId,
              date: dateStr,
              isV0,
              is10Yd,
              reps: [],
            }
          }

          athleteSessions[sessionKey].reps.push({ load: isNaN(loadKg) ? 2.0 : loadKg, speed: speedMps })
          totalMatchedReps++
        })

        if (unmatchedNameSet.size > 0) {
          const unmatchedList = Array.from(unmatchedNameSet)
          setTen80Logs((prev) => [
            ...prev,
            `Unmatched names (${unmatchedList.length}): "${unmatchedList.slice(0, 5).join('", "')}"${unmatchedList.length > 5 ? '...' : ''}`,
          ])
        }

        setTen80Logs((prev) => [
          ...prev,
          `Matched ${totalMatchedReps} reps across ${Object.keys(athleteSessions).length} unique sprint sessions.`,
        ])

        const metricsToInsert: { athlete_id: string; test_date: string; v0_speed: number | null; top_speed: number | null }[] = []

        Object.values(athleteSessions).forEach((session) => {
          let maxSpeedMps = Math.max(...session.reps.map((r) => r.speed))
          let calculatedV0Mps = maxSpeedMps

          if (session.isV0 && session.reps.length >= 2) {
            const n = session.reps.length
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0

            session.reps.forEach((pt) => {
              sumX += pt.load
              sumY += pt.speed
              sumXY += pt.load * pt.speed
              sumXX += pt.load * pt.load
            })

            const denom = n * sumXX - sumX * sumX
            if (denom !== 0) {
              const slope = (n * sumXY - sumX * sumY) / denom
              const intercept = (sumY - slope * sumX) / n
              if (intercept > maxSpeedMps) calculatedV0Mps = intercept
            }
          }

          const maxSpeedMph = Number((maxSpeedMps * MPS_TO_MPH).toFixed(2))
          const calculatedV0Mph = Number((calculatedV0Mps * MPS_TO_MPH).toFixed(2))

          metricsToInsert.push({
            athlete_id: session.athleteId,
            test_date: session.date,
            v0_speed: session.isV0 ? calculatedV0Mph : null,
            top_speed: session.is10Yd ? maxSpeedMph : null,
          })
        })

        if (metricsToInsert.length > 0) {
          setTen80Logs((prev) => [...prev, `Inserting ${metricsToInsert.length} session summaries to database...`])

          let dbError: any = null
          const { error: upsertErr } = await supabase
            .from('performance_metrics')
            .upsert(metricsToInsert, { onConflict: 'athlete_id, test_date' })

          if (upsertErr) {
            const { error: insertErr } = await supabase
              .from('performance_metrics')
              .insert(metricsToInsert)

            if (insertErr) dbError = insertErr
          }

          if (dbError) {
            const errStr = dbError?.message || dbError?.details || dbError?.hint || JSON.stringify(dbError)
            throw new Error(`Database save failed: ${errStr}`)
          }

          setTen80Status({
            success: true,
            msg: `Successfully imported ${metricsToInsert.length} sprint session record(s) into database!`,
          })
          fetchLeaderboard()
        } else {
          setTen80Status({
            success: false,
            msg: '0 records imported. Check the diagnostic console below for sample unmatched athlete names.',
          })
        }
      } catch (err: unknown) {
        let errorMsg = 'Unknown error occurred'
        if (err instanceof Error) errorMsg = err.message
        else if (typeof err === 'object' && err !== null) {
          const e = err as any
          errorMsg = e.message || e.details || e.error_description || JSON.stringify(err)
        } else errorMsg = String(err)

        setTen80Status({ success: false, msg: `Parsing error: ${errorMsg}` })
      } finally {
        setTen80Uploading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

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

        const res = await uploadMetricRows(rawData)

        if (res.success) {
          setUploadStatus({
            success: true,
            msg: `Successfully imported ${res.insertedCount} record(s)!`,
            errors: res.errors,
          })
          fetchLeaderboard()
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setUploadStatus({ success: false, msg: `Parsing error: ${errorMsg}` })
      } finally {
        setUploading(false)
      }
    }
    reader.readAsBinaryString(file)
  }

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
        'Weight (lbs)': 195,
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(templateData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Metrics Template')
    XLSX.writeFile(workbook, 'GVN_Metrics_Upload_Template.xlsx')
  }

  // Filter Data by Search Term AND Multi-selected Locations
  const filteredData = data.filter((a) => {
    const nameMatch = `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase())
    const locationMatch =
      selectedLocations.length === 0 ||
      (a.location && selectedLocations.includes(a.location))
    return nameMatch && locationMatch
  })

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
                setTen80Status(null)
                setTen80Logs([])
                setTen80ModalOpen(true)
              }}
              className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold px-4 py-2.5 rounded-lg transition shadow-lg shadow-orange-600/20"
            >
              <Zap className="w-4 h-4 text-amber-200 fill-amber-200" />
              <span>Import 1080 Sprint Data</span>
            </button>

            <button
              onClick={() => {
                setUploadStatus(null)
                setUploadModalOpen(true)
              }}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
              <span>General Template Upload</span>
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

        {/* Filters Bar: Search + Multi-Location Checkbox Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Search */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search athletes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
            />
          </div>

          {/* Multi-Location Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
              className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 hover:border-slate-700 transition"
            >
              <MapPin className="w-4 h-4 text-red-500" />
              <span className="font-medium">
                {selectedLocations.length === 0
                  ? 'All Locations'
                  : `${selectedLocations.length} Location(s) Selected`}
              </span>
            </button>

            {locationDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-3 z-30 space-y-1">
                <div className="text-xs font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Filter by Facility
                </div>
                {GVN_LOCATIONS.map((loc) => {
                  const isChecked = selectedLocations.includes(loc)
                  return (
                    <button
                      key={loc}
                      onClick={() => toggleLocationSelect(loc)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition"
                    >
                      <span>{loc}</span>
                      {isChecked && <Check className="w-4 h-4 text-red-500" />}
                    </button>
                  )
                })}
                {selectedLocations.length > 0 && (
                  <button
                    onClick={() => setSelectedLocations([])}
                    className="w-full mt-2 pt-2 border-t border-slate-800 text-center text-[11px] font-semibold text-red-400 hover:text-red-300 transition"
                  >
                    Clear Selected Filters
                  </button>
                )}
              </div>
            )}
          </div>
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
                  filteredData.map((a) => {
                    const isSprintLevel2 = a.v0_speed !== null && a.v0_speed >= 17.50
                    const sprintLevelLabel = isSprintLevel2 ? 'Level 2' : 'Level 1'

                    return (
                      <tr key={a.athlete_id} className="hover:bg-slate-800/40 transition">
                        <td className="py-4 px-6 font-semibold text-white">
                          <div className="flex items-center space-x-2">
                            <span>{a.first_name} {a.last_name}</span>
                          </div>
                          {a.location && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700/60 rounded-md text-[10px] font-medium">
                              {a.location}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-slate-400">{a.position}</td>
                        <td className="py-4 px-4 text-slate-400">
                          {a.height_inches ? `${a.height_inches}"` : '-'} / {a.weight_lbs ? `${a.weight_lbs} lbs` : '-'}
                        </td>
                        <td className="py-4 px-4 font-medium text-slate-200">
                          {a.iso_rel_peak_force ? `${a.iso_rel_peak_force} N/kg` : '-'}
                        </td>
                        <td className="py-4 px-4 font-medium text-slate-200">
                          {a.v0_speed ? `${a.v0_speed} mph` : '-'}
                        </td>
                        <td className="py-4 px-4 font-medium text-slate-200">
                          {a.max_jump ? `${a.max_jump}"` : '-'}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                              a.workout_level === 'Level 3'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {a.workout_level}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                              isSprintLevel2
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                            }`}
                          >
                            {sprintLevelLabel}
                          </span>
                        </td>
                      </tr>
                    )
                  })
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
                  <label className="text-xs font-semibold text-slate-400">Training Facility / Location</label>
                  <select
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    {GVN_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
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

        {/* MODAL 2: DEDICATED 1080 MOTION SPRINT IMPORT */}
        {ten80ModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div>
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-orange-400 fill-orange-400" />
                  <h3 className="text-xl font-bold text-white">Import 1080 Motion Data</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Upload raw 1080 Motion Excel export (.xlsx). Automatically matches athletes, computes linear V0 regressions, and converts speeds to mph.
                </p>
              </div>

              {/* Status Alert */}
              {ten80Status && (
                <div
                  className={`p-4 rounded-xl border text-xs ${
                    ten80Status.success
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-red-950/40 border-red-800 text-red-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-medium">
                    {ten80Status.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span>{ten80Status.msg}</span>
                  </div>
                </div>
              )}

              {/* Log Output Console */}
              {ten80Logs.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-32 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
                  {ten80Logs.map((log, i) => (
                    <div key={i}>&gt; {log}</div>
                  ))}
                </div>
              )}

              {/* Dropzone */}
              <div className="border-2 border-dashed border-orange-900/60 hover:border-orange-500 rounded-xl p-8 text-center bg-slate-950/40 transition group cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handle1080FileUpload}
                  disabled={ten80Uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-3 bg-orange-950/40 rounded-full group-hover:bg-orange-900/60 transition">
                    <Upload className="w-6 h-6 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {ten80Uploading ? 'Processing 1080 File...' : 'Upload 1080 Motion Excel Export'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Select linear-export-237 clients file (.xlsx / .csv)</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setTen80ModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: GENERAL TEMPLATE UPLOAD */}
        {uploadModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-white">Import Metrics & Field Tests</h3>
                  <p className="text-xs text-slate-400 mt-1">Upload standard GVN template file.</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center space-x-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/50 border border-red-800/60 px-3 py-1.5 rounded-lg transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Template</span>
                </button>
              </div>

              {uploadStatus && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2 ${
                    uploadStatus.success === true
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : uploadStatus.success === false
                      ? 'bg-red-950/40 border-red-800 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
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
                      {uploading ? 'Processing file...' : 'Click or drag template file to upload'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Supports pre-formatted .xlsx, .xls, or .csv template</p>
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