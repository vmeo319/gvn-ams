// Date-range presets shared by the Group Metrics report and athlete metric dashboards.

export type RangePreset = '30d' | '90d' | '6m' | '12m' | 'summer' | 'all' | 'custom'

export const toISO = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// GVN's summer training block: Jun 1 - Aug 14 of the current year once June has started,
// otherwise last year's.
export function summerRange(): { start: string; end: string; label: string } {
  const now = new Date()
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
  return { start: `${year}-06-01`, end: `${year}-08-14`, label: `Summer ${year}` }
}

export function presetRange(preset: RangePreset): { start: string; end: string } {
  const today = new Date()
  const back = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return toISO(d)
  }
  switch (preset) {
    case '30d': return { start: back(30), end: toISO(today) }
    case '90d': return { start: back(90), end: toISO(today) }
    case '6m': return { start: back(182), end: toISO(today) }
    case '12m': return { start: back(365), end: toISO(today) }
    case 'summer': return summerRange()
    case 'all': return { start: '2000-01-01', end: toISO(today) }
    default: return { start: back(90), end: toISO(today) }
  }
}

export function rangePresets(): { key: RangePreset; label: string }[] {
  return [
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'summer', label: summerRange().label },
    { key: '6m', label: '6 months' },
    { key: '12m', label: '12 months' },
    { key: 'all', label: 'All time' },
    { key: 'custom', label: 'Custom' },
  ]
}
