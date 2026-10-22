import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gatherSignals } from './trends.ts'
import { scoreTopics } from './score.ts'
import { findImages } from './content.ts'
import { buildKit } from './kit.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outRoot = join(root, 'output')
const PORT = Number(process.env.PORT) || 5190
const HOST = '127.0.0.1'

const MAX_BODY = 16 * 1024

function send(res: import('node:http').ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

async function readJson(req: import('node:http').IncomingMessage): Promise<any> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY) throw new Error('body too large')
    chunks.push(c as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}`)
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, await readFile(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8')
    }
    if (req.method === 'GET' && url.pathname.startsWith('/output/')) {
      const file = resolve(root, decodeURIComponent(url.pathname.slice(1)))
      if (!file.startsWith(outRoot + sep)) return send(res, 403, { error: 'Forbidden' })
      const type = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.png') ? 'image/png' : 'text/plain; charset=utf-8'
      return send(res, 200, await readFile(file), type)
    }
    if (req.method === 'POST' && url.pathname === '/api/topics') {
      const { niche } = await readJson(req)
      const name = String(niche ?? '').trim().slice(0, 80)
      if (!name) return send(res, 400, { error: 'Enter a niche, for example "politics".' })
      const { signals, errors } = await gatherSignals(name)
      const trendTitles = signals.filter((s) => s.source === 'google-trends').map((s) => s.title)
      const topics = scoreTopics(signals, name, trendTitles).slice(0, 10)
      return send(res, 200, { niche: name, topics, errors, fetchedAt: new Date().toISOString() })
    }
    if (req.method === 'POST' && url.pathname === '/api/kit') {
      const { niche, topic } = await readJson(req)
      if (!topic?.title || !Array.isArray(topic.signals)) return send(res, 400, { error: 'Missing topic.' })
      const terms = (Array.isArray(topic.keywords) ? topic.keywords : []).slice(0, 2).join(' ')
      const images = await findImages(terms || String(niche ?? ''))
      const kit = await buildKit(topic, String(niche ?? ''), images, outRoot)
      return send(res, 200, { ...kit, folder: kit.folder.replace(root, '').replace(/^[\\/]+/, '').replace(/\\/g, '/'), images })
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    send(res, 500, { error: (e as Error).message })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`viral-finder running at http://${HOST}:${PORT}`)
})
