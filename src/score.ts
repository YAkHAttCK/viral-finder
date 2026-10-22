import type { Signal } from './trends.ts'

export interface Topic {
  title: string // representative headline
  keywords: string[]
  signals: Signal[]
  score: number // 0-100
  breakdown: { momentum: number; recency: number; engagement: number; nicheFit: number; trendsOverlap: number }
}

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'is', 'are',
  'was', 'were', 'be', 'this', 'that', 'it', 'its', 'after', 'over', 'new', 'says', 'say', 'how', 'why', 'what',
  'who', 'will', 'more', 'about', 'into', 'than', 'up', 'out', 'not', 'his', 'her', 'their', 'you', 'your', 'vs',
])

export function keywordsOf(text: string): string[] {
  return [...new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
  )]
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const inter = b.filter((x) => A.has(x)).length
  return inter === 0 ? 0 : inter / (A.size + b.length - inter)
}

/** Group signals whose headlines share enough keywords into one topic. */
export function clusterSignals(signals: Signal[], threshold = 0.3): { title: string; keywords: string[]; signals: Signal[] }[] {
  const clusters: { title: string; keywords: string[]; signals: Signal[] }[] = []
  for (const s of signals) {
    const kw = keywordsOf(s.title)
    if (kw.length === 0) continue
    let best: (typeof clusters)[number] | undefined
    let bestSim = 0
    for (const c of clusters) {
      const sim = jaccard(c.keywords, kw)
      if (sim > bestSim) { bestSim = sim; best = c }
    }
    if (best && bestSim >= threshold) {
      best.signals.push(s)
      best.keywords = [...new Set([...best.keywords, ...kw])]
    } else {
      clusters.push({ title: s.title, keywords: kw, signals: [s] })
    }
  }
  return clusters
}

/**
 * Score a topic 0-100. Weights are fixed and reported in the breakdown so the
 * result can be audited: a score is a prediction of spread, not a guarantee.
 *  - momentum (30): distinct sources covering the topic
 *  - recency (25): newest item, half-life 12 hours
 *  - engagement (25): log-scaled Reddit score+comments
 *  - nicheFit (10): share of the niche's own keywords present in the topic
 *  - trendsOverlap (10): topic keywords also in Google Trends daily searches
 */
export function scoreTopics(
  signals: Signal[],
  niche: string,
  trendsTitles: string[],
  now = Date.now(),
): Topic[] {
  const nicheKw = keywordsOf(niche)
  const trendKw = new Set(trendsTitles.flatMap(keywordsOf))
  const topics = clusterSignals(signals).map((c) => {
    const sources = new Set(c.signals.map((s) => s.source)).size
    const momentum = Math.min(1, sources / 3)
    const newest = Math.max(...c.signals.map((s) => s.publishedAt))
    const ageHours = Math.max(0, (now - newest) / 3_600_000)
    const recency = Math.pow(0.5, ageHours / 12)
    const maxEng = Math.max(...c.signals.map((s) => s.engagement), 0)
    const engagement = Math.min(1, Math.log10(1 + maxEng) / 4) // ~10k engagement = 1.0
    const nicheFit = nicheKw.length ? nicheKw.filter((k) => c.keywords.includes(k)).length / nicheKw.length : 0
    const trendsOverlap = c.keywords.some((k) => trendKw.has(k)) ? 1 : 0
    const breakdown = {
      momentum: Math.round(momentum * 30),
      recency: Math.round(recency * 25),
      engagement: Math.round(engagement * 25),
      nicheFit: Math.round(nicheFit * 10),
      trendsOverlap: Math.round(trendsOverlap * 10),
    }
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
    return { title: c.title, keywords: c.keywords, signals: c.signals, score, breakdown }
  })
  return topics.sort((a, b) => b.score - a.score)
}
