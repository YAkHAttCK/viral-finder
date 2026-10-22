import type { Topic } from './score.ts'

export interface ImageCandidate {
  title: string
  thumbUrl: string
  fullUrl: string
  pageUrl: string
  license: string
  artist: string
}

export interface Drafts {
  hooks: string[]
  captions: { platform: 'TikTok' | 'Instagram' | 'X' | 'YouTube Shorts'; text: string }[]
}

/** Short, specific hook lines built from the topic headline. */
export function makeHooks(title: string): string[] {
  const clean = title.replace(/[“”"]/g, '').trim().replace(/[.!?]+$/, '')
  return [
    `Nobody is talking about this part of: ${clean}`,
    `Here's what changed, and why it matters: ${clean}`,
    `Wait, ${clean.charAt(0).toLowerCase() + clean.slice(1)}? Here's the context in 30 seconds.`,
  ]
}

export function makeCaptions(title: string, sourceUrl: string): Drafts['captions'] {
  const hook = makeHooks(title)[0]
  return [
    { platform: 'TikTok', text: `${hook} 👇 Follow for more on this.` },
    { platform: 'Instagram', text: `${hook}\n\nWhat's your take? Drop it below.\n\nSource: ${sourceUrl}` },
    { platform: 'X', text: `${title.slice(0, 200)} ${sourceUrl}` },
    { platform: 'YouTube Shorts', text: `${hook} #shorts` },
  ]
}

export function makeDrafts(topic: Topic): Drafts {
  const src = topic.signals[0]?.url ?? ''
  return { hooks: makeHooks(topic.title), captions: makeCaptions(topic.title, src) }
}

interface CommonsPage {
  title: string
  imageinfo?: {
    thumburl?: string
    url?: string
    descriptionurl?: string
    extmetadata?: { LicenseShortName?: { value: string }; Artist?: { value: string } }
  }[]
}

/** Search Wikimedia Commons for freely licensed images. Failures return []. */
export async function findImages(query: string, limit = 6): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search',
    gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640',
  })
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'user-agent': 'viral-finder/0.1 (local content research tool)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } }
    const pages = Object.values(data.query?.pages ?? {})
    return pages
      .map((p) => {
        const info = p.imageinfo?.[0]
        const meta = info?.extmetadata
        return {
          title: p.title.replace(/^File:/, ''),
          thumbUrl: info?.thumburl ?? '',
          fullUrl: info?.url ?? '',
          pageUrl: info?.descriptionurl ?? '',
          license: meta?.LicenseShortName?.value ?? 'unknown',
          artist: (meta?.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim(),
        }
      })
      .filter((i) => i.thumbUrl && i.fullUrl)
  } catch {
    return []
  }
}
