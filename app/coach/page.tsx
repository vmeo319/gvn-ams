'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Search, FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2, Zap, MapPin, Check, ChevronDown, LogOut, Copy, Trophy, UserCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { upsertAthleteAction, uploadMetricRows, uploadHawkinsScoreboardCSV } from './actions'
import { getWorkoutStatusColor, WORKOUT_STATUS_STYLES } from '@/lib/workoutStatus'

// These 3 coaches only work out of North Shore day-to-day, so default the dashboard's
// location filter (and the levels columns, which North Shore actually uses) to that —
// still just a starting default, changeable via the existing filter UI.
const DEFAULT_NORTH_SHORE_EMAILS = ['ryanlajeuness@gmail.com', 'j.frey@gvn.com', 'vmeo319@gmail.com']

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

interface LocationRow {
  id: string
  name: string
}

interface ImportStatusRow {
  source: string
  last_imported_at: string
  triggered_by: 'auto' | 'manual'
}

function formatOneImportLine(row: ImportStatusRow | undefined, label: string): string {
  if (!row) return `${label}: never`
  const date = new Date(row.last_imported_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${label}: ${date}`
}

export default function CoachDashboard() {
  const router = useRouter()
  const [data, setData] = useState<LeaderboardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false)
  const [importDropdownOpen, setImportDropdownOpen] = useState(false)
  const [locationOptions, setLocationOptions] = useState<LocationRow[]>([])
  const [importStatus, setImportStatus] = useState<Record<string, ImportStatusRow>>({})
  const [workoutByAthlete, setWorkoutByAthlete] = useState<Map<string, { name: string; weeksCompleted: number }>>(new Map())
  const [showLevels, setShowLevels] = useState(false)

  // Modal States
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [ten80ModalOpen, setTen80ModalOpen] = useState(false)
  const [hawkinsModalOpen, setHawkinsModalOpen] = useState(false)

  // Add / Edit Athlete Form State — only firstName/lastName are required. Everything
  // else is optional and independent: a coach can set any subset of these at once.
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthYear: '',
    position: '',
    heightInches: '',
    weightLbs: '',
    locationId: '',
  })
  const [modalError, setModalError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Upload Metrics State
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ success?: boolean; msg: string; errors?: string[] } | null>(null)

  // Hawkins Upload State
  const [hawkinsUploading, setHawkinsUploading] = useState(false)
  const [hawkinsStatus, setHawkinsStatus] = useState<{ success?: boolean; msg: string; errors?: string[] } | null>(null)

  // 1080 Upload State
  const [ten80Uploading, setTen80Uploading] = useState(false)
  const [ten80Logs, setTen80Logs] = useState<string[]>([])
  const [ten80Status, setTen80Status] = useState<{ success?: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetchLeaderboard()
    fetchLocations()
    fetchImportStatus()
    fetchWorkouts()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && DEFAULT_NORTH_SHORE_EMAILS.includes(user.email.toLowerCase())) {
        setSelectedLocations(['GVN- North Shore'])
        setShowLevels(true)
      }
    })
  }, [])

  const fetchWorkouts = async () => {
    const { data: rows, error } = await supabase
      .from('athlete_current_workout')
      .select('athlete_id, workout_name, weeks_completed')
    if (!error && rows) {
      const map = new Map<string, { name: string; weeksCompleted: number }>()
      rows.forEach((r: any) => map.set(r.athlete_id, { name: r.workout_name, weeksCompleted: r.weeks_completed || 0 }))
      setWorkoutByAthlete(map)
    }
  }

  const fetchLocations = async () => {
    const { data: locs, error } = await supabase.from('locations').select('id, name').order('name')
    if (!error && locs) setLocationOptions(locs as LocationRow[])
  }

  const fetchImportStatus = async () => {
    const { data, error } = await supabase.from('import_status').select('source, last_imported_at, triggered_by')
    if (!error && data) {
      const map: Record<string, ImportStatusRow> = {}
      ;(data as ImportStatusRow[]).forEach((row) => { map[`${row.source}_${row.triggered_by}`] = row })
      setImportStatus(map)
    }
  }

  const fetchLeaderboard = async () => {
    setLoading(true)
    const { data: records, error } = await supabase
      .from('coach_365d_leaderboard')
      .select('*')

    if (error) {
      console.error('Error loading leaderboard:', error.message || error)
    } else {
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
    setModalMessage('')
    setInviteLink('')
    setSubmitting(true)

    const res = await upsertAthleteAction({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || undefined,
      birthYear: formData.birthYear ? Number(formData.birthYear) : undefined,
      position: formData.position || undefined,
      heightInches: formData.heightInches ? Number(formData.heightInches) : undefined,
      weightLbs: formData.weightLbs ? Number(formData.weightLbs) : undefined,
      locationId: formData.locationId || undefined,
    })

    setSubmitting(false)

    if (!res.success) {
      setModalError(res.error || 'Failed to save athlete.')
      return
    }

    fetchLeaderboard()

    if (res.inviteLink) {
      setInviteLink(res.inviteLink)
      setModalMessage(res.message || '')
      return
    }

    setModalMessage(res.message || '')
    setTimeout(() => {
      setAddModalOpen(false)
      setModalMessage('')
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        birthYear: '',
        position: '',
        heightInches: '',
        weightLbs: '',
        locationId: '',
      })
    }, 1200)
  }

  const toggleLocationSelect = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter((l) => l !== loc))
    } else {
      setSelectedLocations([...selectedLocations, loc])
    }
  }

  // Hawkins Scoreboard CSV Upload Handler with Client-Side Chunking
  const handleHawkinsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setHawkinsUploading(true)
    setHawkinsStatus({ msg: 'Parsing Hawkins CSV file...' })

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const allRows = results.data as any[]
          const chunkSize = 150
          let totalInserted = 0

          setHawkinsStatus({ msg: `Processing ${allRows.length} total rows in batches...` })

          for (let i = 0; i < allRows.length; i += chunkSize) {
            const chunk = allRows.slice(i, i + chunkSize)
            const res = await uploadHawkinsScoreboardCSV(chunk)
            if (res.success && res.insertedCount) {
              totalInserted += res.insertedCount
            }
          }

          setHawkinsStatus({
            success: true,
            msg: `Import Successful! Uploaded ${totalInserted} session record(s) across all athletes.`,
          })
          fetchLeaderboard()
          fetchImportStatus()
        } catch (err: any) {
          setHawkinsStatus({ success: false, msg: `Upload failed: ${err.message}` })
        } finally {
          setHawkinsUploading(false)
        }
      },
      error: (err) => {
        setHawkinsStatus({ success: false, msg: `CSV Parse Error: ${err.message}` })
        setHawkinsUploading(false)
      },
    })
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

        const metricsToInsert: Record<string, any>[] = []

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

          const payload: Record<string, any> = {
            athlete_id: session.athleteId,
            test_date: session.date,
          }
          if (session.isV0) payload.v0_speed = calculatedV0Mph
          if (session.is10Yd) payload.top_speed = maxSpeedMph

          metricsToInsert.push(payload)
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
          await supabase.from('import_status').upsert(
            { source: '1080', last_imported_at: new Date().toISOString(), triggered_by: 'manual', records_count: metricsToInsert.length },
            { onConflict: 'source, triggered_by' }
          )
          fetchLeaderboard()
          fetchImportStatus()
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
          fetchImportStatus()
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

  const filteredData = data
    .filter((a) => {
      const nameMatch = `${a.first_name} ${a.last_name}`.toLowerCase().includes(search.toLowerCase())
      const locationMatch =
        selectedLocations.length === 0 ||
        (a.location && selectedLocations.includes(a.location))
      return nameMatch && locationMatch
    })
    .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''))

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
            
            {/* UNIFIED IMPORT BUTTON */}
            <div className="relative">
              <button
                onClick={() => setImportDropdownOpen(!importDropdownOpen)}
                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-5 py-2.5 rounded-lg border border-slate-700 transition shadow-lg shadow-slate-900"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>Import Data</span>
                <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${importDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {importDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 overflow-hidden">
                  <button
                    onClick={() => {
                      setImportDropdownOpen(false)
                      setHawkinsStatus(null)
                      setHawkinsModalOpen(true)
                    }}
                    className="flex items-center space-x-3 w-full p-2.5 rounded-lg hover:bg-slate-800 transition text-left text-sm font-medium text-slate-200"
                  >
                    <img src="/Hawkins-logo.png" alt="Hawkins" className="w-6 h-6 object-contain" />
                    <div className="flex flex-col">
                      <span>From Hawkins</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        {formatOneImportLine(importStatus['hawkins_auto'], 'Auto')} · {formatOneImportLine(importStatus['hawkins_manual'], 'Manual')}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setImportDropdownOpen(false)
                      setTen80Status(null)
                      setTen80Logs([])
                      setTen80ModalOpen(true)
                    }}
                    className="flex items-center space-x-3 w-full p-2.5 rounded-lg hover:bg-slate-800 transition text-left text-sm font-medium text-slate-200"
                  >
                    <img src="/1080-logo.jpg" alt="1080 Motion" className="w-6 h-6 object-contain rounded-sm" />
                    <div className="flex flex-col">
                      <span>From 1080 Motion</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        {formatOneImportLine(importStatus['1080_auto'], 'Auto')} · {formatOneImportLine(importStatus['1080_manual'], 'Manual')}
                      </span>
                    </div>
                  </button>

                  <div className="h-px w-full bg-slate-800/60 my-1"></div>

                  <button
                    onClick={() => {
                      setImportDropdownOpen(false)
                      setUploadStatus(null)
                      setUploadModalOpen(true)
                    }}
                    className="flex items-center space-x-3 w-full p-2.5 rounded-lg hover:bg-slate-800 transition text-left text-sm font-medium text-slate-200"
                  >
                    <img src="/Excelologo.png" alt="Excel" className="w-6 h-6 object-contain" />
                    <div className="flex flex-col">
                      <span>From Excel Template</span>
                      <span className="text-[10px] font-normal text-slate-500">{formatOneImportLine(importStatus['excel_manual'], 'Last')}</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setModalError('')
                setAddModalOpen(true)
              }}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg transition shadow-lg shadow-red-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add / Edit Athlete</span>
            </button>

            <Link
              href="/coach/leaderboards"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Leaderboards</span>
            </Link>

            <Link
              href="/coach/workouts"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <Zap className="w-4 h-4 text-red-400" />
              <span>Workouts</span>
            </Link>

            <Link
              href="/athlete"
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <UserCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Athlete View</span>
            </Link>

            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2.5 rounded-lg border border-slate-700 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
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

          <button
            onClick={() => setShowLevels((v) => !v)}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium border transition ${
              showLevels
                ? 'bg-red-950/20 border-red-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>Levels</span>
          </button>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Athlete</th>
                  <th className="py-4 px-4">Current Workout</th>
                  <th className="py-4 px-4">Pos</th>
                  <th className="py-4 px-4">Ht / Wt</th>
                  <th className="py-4 px-4">ISO Peak Force</th>
                  <th className="py-4 px-4">V0 Speed</th>
                  <th className="py-4 px-4 text-cyan-400">10yd Top Speed</th>
                  <th className="py-4 px-4">Max Jump</th>
                  {showLevels && <th className="py-4 px-4 text-center">Workout Level</th>}
                  {showLevels && <th className="py-4 px-4 text-center">Sprint Level</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={showLevels ? 10 : 8} className="py-12 text-center text-slate-500">
                      Loading GVN performance records...
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={showLevels ? 10 : 8} className="py-12 text-center text-slate-500">
                      No matching athletes found.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((a) => {
                    const isSprintLevel2 = a.v0_speed !== null && a.v0_speed >= 17.50
                    const sprintLevelLabel = isSprintLevel2 ? 'Level 2' : 'Level 1'
                    const currentWorkout = workoutByAthlete.get(a.athlete_id)
                    const workoutColor = currentWorkout ? getWorkoutStatusColor(currentWorkout.weeksCompleted) : null
                    const workoutStyle = workoutColor ? WORKOUT_STATUS_STYLES[workoutColor] : null

                    return (
                      <tr
                        key={a.athlete_id}
                        onClick={() => router.push(`/coach/athlete/${a.athlete_id}`)}
                        className="hover:bg-slate-800/40 transition cursor-pointer"
                      >
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
                        <td className="py-4 px-4">
                          {currentWorkout ? (
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${workoutStyle!.dot}`} />
                              <span className="text-slate-300 text-xs">{currentWorkout.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
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
                        <td className="py-4 px-4 font-bold text-cyan-400">
                          {a.top_speed ? `${a.top_speed} mph` : '-'}
                        </td>
                        <td className="py-4 px-4 font-medium text-slate-200">
                          {a.max_jump ? `${a.max_jump}"` : '-'}
                        </td>
                        {showLevels && (
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
                        )}
                        {showLevels && (
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
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL 1: ADD / EDIT ATHLETE */}
        {addModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Add / Edit Athlete</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Name is the only required field. If it matches an existing athlete, whatever you fill in below updates their profile instead of creating a duplicate.
                </p>
              </div>

              {modalError && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300">
                  {modalError}
                </div>
              )}

              {modalMessage && !inviteLink && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300">
                  {modalMessage}
                </div>
              )}

              {inviteLink ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300">
                    {modalMessage}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Activation Link</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        readOnly
                        value={inviteLink}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 rounded-lg text-xs font-semibold text-slate-200 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">Send this to the athlete yourself (text, email, etc). It lets them set their own password and log in.</p>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setAddModalOpen(false)
                        setInviteLink('')
                        setModalMessage('')
                        setFormData({ firstName: '', lastName: '', email: '', birthYear: '', position: '', heightInches: '', weightLbs: '', locationId: '' })
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
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
                  <label className="text-xs font-semibold text-slate-400">Training Facility / Location <span className="text-slate-600">(optional)</span></label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="">— Leave unchanged —</option>
                    {locationOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400">Email Address <span className="text-slate-600">(optional — gives them a login)</span></label>
                  <input
                    type="email"
                    placeholder="athlete@gmail.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Position <span className="text-slate-600">(optional)</span></label>
                    <select
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    >
                      <option value="">— Leave unchanged —</option>
                      <option value="Forward">Forward</option>
                      <option value="Defense">Defense</option>
                      <option value="Goalie">Goalie</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Birth Year <span className="text-slate-600">(optional)</span></label>
                    <input
                      type="number"
                      placeholder="e.g. 2007"
                      value={formData.birthYear}
                      onChange={(e) => setFormData({ ...formData, birthYear: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Height (inches) <span className="text-slate-600">(optional)</span></label>
                    <input
                      type="number"
                      placeholder="e.g. 72"
                      value={formData.heightInches}
                      onChange={(e) => setFormData({ ...formData, heightInches: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400">Weight (lbs) <span className="text-slate-600">(optional)</span></label>
                    <input
                      type="number"
                      placeholder="e.g. 185"
                      value={formData.weightLbs}
                      onChange={(e) => setFormData({ ...formData, weightLbs: e.target.value })}
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
              )}
            </div>
          </div>
        )}

        {/* MODAL 2: HAWKINS SCOREBOARD CSV UPLOAD */}
        {hawkinsModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Import Hawkins Scoreboard CSV</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload raw Hawkins exports (.csv). Automatically matches athlete profiles and saves CMJ Jump Height or ISO Belt Squat Force.
                </p>
              </div>

              {hawkinsStatus && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2 ${
                    hawkinsStatus.success === true
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : hawkinsStatus.success === false
                      ? 'bg-red-950/40 border-red-800 text-red-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-medium">
                    {hawkinsStatus.success === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{hawkinsStatus.msg}</span>
                  </div>
                  {hawkinsStatus.errors && hawkinsStatus.errors.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px] max-h-24 overflow-y-auto">
                      {hawkinsStatus.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="border-2 border-dashed border-blue-900/60 hover:border-blue-500 rounded-xl p-8 text-center bg-slate-950/40 transition group cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleHawkinsFileUpload}
                  disabled={hawkinsUploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-3 bg-blue-950/40 rounded-full group-hover:bg-blue-900/60 transition">
                    <img src="/Hawkins-logo.png" alt="Hawkins" className="w-8 h-8 object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">
                      {hawkinsUploading ? 'Processing Hawkins CSV in Batches...' : 'Click or Drag Hawkins Master CSV'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Supports unlimited rows (.csv)</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setHawkinsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: DEDICATED 1080 MOTION SPRINT IMPORT */}
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

              {ten80Logs.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 max-h-32 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
                  {ten80Logs.map((log, i) => (
                    <div key={i}>&gt; {log}</div>
                  ))}
                </div>
              )}

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
                    <img src="/1080-logo.jpg" alt="1080" className="w-8 h-8 object-contain rounded" />
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

        {/* MODAL 4: GENERAL TEMPLATE UPLOAD */}
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
                    <img src="/Excelologo.png" alt="Excel" className="w-8 h-8 object-contain" />
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