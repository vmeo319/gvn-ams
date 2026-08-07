export type TrendClassification = 'improving' | 'plateauing' | 'declining' | 'insufficient_data'

export interface TrendResult {
  classification: TrendClassification
  percentChange90: number | null
  pointCount: number
  lowConfidence: boolean
}

const IMPROVING_THRESHOLD = 3 // percent change over the 90-day window
const DECLINING_THRESHOLD = -3
const MIN_POINTS_FOR_CONFIDENCE = 4
const WINDOW_DAYS = 90

// Least-squares linear fit of value vs. days-since-first-point-in-window, normalized to a
// percent change over the 90-day window. Same regression technique already used for the
// V0-speed trend in app/coach/page.tsx, reused here for consistency.
export function computeTrend(points: { date: string; value: number }[]): TrendResult {
  const now = Date.now()
  const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const windowed = points
    .filter((p) => new Date(p.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (windowed.length < 2) {
    return { classification: 'insufficient_data', percentChange90: null, pointCount: windowed.length, lowConfidence: true }
  }

  const t0 = new Date(windowed[0].date).getTime()
  const xs = windowed.map((p) => (new Date(p.date).getTime() - t0) / (24 * 60 * 60 * 1000))
  const ys = windowed.map((p) => p.value)
  const n = xs.length

  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0)
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0)

  const denom = n * sumXX - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n

  const baseline = intercept > 0 ? intercept : sumY / n
  const percentChange90 = baseline !== 0 ? (slope * WINDOW_DAYS) / baseline * 100 : 0

  let classification: TrendClassification
  if (percentChange90 >= IMPROVING_THRESHOLD) classification = 'improving'
  else if (percentChange90 <= DECLINING_THRESHOLD) classification = 'declining'
  else classification = 'plateauing'

  return {
    classification,
    percentChange90,
    pointCount: n,
    lowConfidence: n < MIN_POINTS_FOR_CONFIDENCE,
  }
}
