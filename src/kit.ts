import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Resvg } from '@resvg/resvg-js'
import ffmpegStatic from 'ffmpeg-static'
import type { Topic } from './score.ts'
import { makeDrafts, type ImageCandidate } from './content.ts'

const run = promisify(execFile)

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Wrap text into lines of roughly `width` characters. */
export function wrap(text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width && cur) { lines.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  }
  return lines
}

/** SVG card, 1080x1350 (4:5, works for Instagram and X). */
export function cardSvg(title: string, niche: string, score: number): string {
  const lines = wrap(title, 28, 6)
  const text = lines.map((l, i) => `<text x="80" y="${470 + i * 96}" font-size="84" font-weight="700" fill="#fff" font-family="sans-serif">${esc(l)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2b64"/><stop offset="1" stop-color="#c2185b"/></linearGradient></defs>
  <rect width="1080" height="1350" fill="url(#g)"/>
  <text x="80" y="150" font-size="44" fill="#ffd166" font-family="sans-serif" font-weight="700">${esc(niche.toUpperCase())}</text>
  ${text}
  <text x="80" y="1230" font-size="36" fill="#e0e0e0" font-family="sans-serif">Trend score ${score}/100</text>
</svg>`
}

/** Render the SVG card to PNG bytes. */
export function renderCardPng(svg: string): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng()
}

/** Encode a 6-second vertical MP4 from the PNG card with the bundled ffmpeg. */
export async function encodeVideo(pngPath: string, mp4Path: string): Promise<void> {
  const ffmpegPath = ffmpegStatic as unknown as string | null
  if (!ffmpegPath) throw new Error('ffmpeg binary not available')
  await run(ffmpegPath, [
    '-y', '-loop', '1', '-i', pngPath, '-t', '6', '-r', '30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=720:900', '-movflags', '+faststart', mp4Path,
  ])
}

export interface KitResult {
  folder: string
  files: string[]
  videoError?: string
}

export async function buildKit(topic: Topic, niche: string, images: ImageCandidate[], outRoot: string): Promise<KitResult> {
  const slug = topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'topic'
  const folder = join(outRoot, `${slug}-${Date.now()}`)
  await mkdir(folder, { recursive: true })

  const files: string[] = []
  const png = join(folder, 'card.png')
  await writeFile(png, renderCardPng(cardSvg(topic.title, niche, topic.score)))
  files.push('card.png')

  let videoError: string | undefined
  try {
    await encodeVideo(png, join(folder, 'video.mp4'))
    files.push('video.mp4')
  } catch (e) {
    videoError = (e as Error).message
  }

  const drafts = makeDrafts(topic)
  const captions = [
    ...drafts.hooks.map((h, i) => `Hook ${i + 1}: ${h}`),
    '',
    ...drafts.captions.map((c) => `[${c.platform}]\n${c.text}`),
  ].join('\n\n')
  await writeFile(join(folder, 'captions.txt'), captions + '\n')
  files.push('captions.txt')

  const sources = [
    `Topic: ${topic.title}`,
    `Score: ${topic.score}/100`,
    `Breakdown: ${JSON.stringify(topic.breakdown)}`,
    '',
    'Headline sources:',
    ...topic.signals.map((s) => `- [${s.source}] ${s.title} — ${s.url}`),
    '',
    'Images (check each license before use):',
    ...(images.length
      ? images.map((i) => `- ${i.title} — ${i.license} — ${i.artist || 'unknown artist'} — ${i.pageUrl}`)
      : ['- none found']),
  ].join('\n')
  await writeFile(join(folder, 'sources.txt'), sources + '\n')
  files.push('sources.txt')

  return { folder, files, videoError }
}
