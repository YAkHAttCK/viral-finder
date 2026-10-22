export interface Signal {
  title: string
  url: string
  source: 'google-news' | 'reddit' | 'google-trends'
  publishedAt: number // epoch ms
  engagement: number // raw source-specific engagement (0 when unknown)
}

const UA = 'viral-finder/0.1 (local content research tool)'

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()
}

/** Parse RSS <item> blocks into title/link/date. Exported for tests. */
export function parseRssItems(xml: string): { title: string; link: string; pubDate: string }[] {
  const items: { title: string; link: string; pubDate: string }[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1]
    const get = (tag: string) => {
      const r = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
      return r ? decodeEntities(r[1]) : ''
    }
    items.push({ title: get('title'), link: get('link'), pubDate: get('pubDate') })
  }
  return items
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`)
  return res.text()
}

export async function googleNewsSignals(niche: string): Promise<Signal[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(niche)}&hl=en-US&gl=US&ceid=US:en`
  const items = parseRssItems(await getText(url))
  return items.slice(0, 40).map((it) => ({
    title: it.title.replace(/\s+-\s+[^-]+$/, ''), // strip " - Publisher"
    url: it.link,
    source: 'google-news' as const,
    publishedAt: Date.parse(it.pubDate) || Date.now(),
    engagement: 0,
  }))
}

export async function googleTrendsSignals(): Promise<Signal[]> {
  // Daily trending searches, US. Used as an overall momentum check.
  const items = parseRssItems(await getText('https://trends.google.com/trending/rss?geo=US'))
  return items.slice(0, 30).map((it) => ({
    title: it.title,
    url: it.link,
    source: 'google-trends' as const,
    publishedAt: Date.parse(it.pubDate) || Date.now(),
    engagement: 0,
  }))
}

export async function redditSignals(niche: string): Promise<Signal[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(niche)}&sort=top&t=week&limit=40&raw_json=1`
  const data = JSON.parse(await getText(url))
  const children: any[] = data?.data?.children ?? []
  return children.map((c) => {
    const d = c.data
    return {
      title: String(d.title ?? ''),
      url: `https://www.reddit.com${d.permalink ?? ''}`,
      source: 'reddit' as const,
      publishedAt: Number(d.created_utc ?? 0) * 1000,
      engagement: Number(d.score ?? 0) + 2 * Number(d.num_comments ?? 0),
    }
  })
}

/** Gather signals from every source; a failing source is reported, not fatal. */
export async function gatherSignals(niche: string): Promise<{ signals: Signal[]; errors: string[] }> {
  const results = await Promise.allSettled([
    googleNewsSignals(niche),
    redditSignals(niche),
    googleTrendsSignals(),
  ])
  const signals: Signal[] = []
  const errors: string[] = []
  results.forEach((r, i) => {
    const name = ['Google News', 'Reddit', 'Google Trends'][i]
    if (r.status === 'fulfilled') signals.push(...r.value)
    else errors.push(`${name}: ${(r.reason as Error).message}`)
  })
  return { signals, errors }
}
