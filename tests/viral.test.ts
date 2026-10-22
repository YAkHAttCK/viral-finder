import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRssItems } from '../src/trends.ts'
import { clusterSignals, scoreTopics, keywordsOf } from '../src/score.ts'
import { makeHooks, makeCaptions } from '../src/content.ts'
import { wrap, cardSvg } from '../src/kit.ts'
import type { Signal } from '../src/trends.ts'

const NOW = Date.UTC(2026, 9, 22, 12)
const sig = (over: Partial<Signal>): Signal => ({
  title: 'x', url: 'https://example.com', source: 'google-news', publishedAt: NOW, engagement: 0, ...over,
})

test('parses RSS items and decodes entities', () => {
  const xml = `<rss><channel><item><title>Trump &amp; Congress &#39;deal&#39;</title><link>https://a.test/1</link><pubDate>Wed, 22 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`
  const [it] = parseRssItems(xml)
  assert.equal(it.title, "Trump & Congress 'deal'")
  assert.equal(it.link, 'https://a.test/1')
})

test('clusters headlines about the same story together', () => {
  const clusters = clusterSignals([
    sig({ title: 'Ilhan Omar faces new primary challenge' }),
    sig({ title: 'Ilhan Omar primary challenge draws donors' }),
    sig({ title: 'Local school board votes on budget' }),
  ])
  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].signals.length, 2)
})

test('ranks a multi-source, fresh, high-engagement topic first', () => {
  const signals: Signal[] = [
    sig({ title: 'Election turnout surges in swing states', source: 'google-news' }),
    sig({ title: 'Swing states election turnout surges again', source: 'reddit', engagement: 5000 }),
    sig({ title: 'Election turnout surges across the country', source: 'google-trends' }),
    sig({ title: 'Quiet zoning change in small town', source: 'google-news', publishedAt: NOW - 5 * 86_400_000 }),
  ]
  const topics = scoreTopics(signals, 'politics', ['election turnout surges'], NOW)
  assert.match(topics[0].title, /turnout/)
  assert.ok(topics[0].score > topics[1].score)
  const b = topics[0].breakdown
  assert.equal(b.momentum + b.recency + b.engagement + b.nicheFit + b.trendsOverlap, topics[0].score)
  assert.ok(topics[0].score <= 100)
})

test('scores are bounded and niche fit is reported', () => {
  const [t] = scoreTopics([sig({ title: 'Politics news today' })], 'politics', [], NOW)
  assert.equal(t.breakdown.nicheFit, 10)
  assert.ok(t.score >= 0 && t.score <= 100)
})

test('keywordsOf drops stopwords and punctuation', () => {
  assert.deepEqual(keywordsOf('The Senate says: a new bill!'), ['senate', 'bill'])
})

test('hooks and captions include the topic and the source link', () => {
  const hooks = makeHooks('Senate passes budget bill.')
  assert.equal(hooks.length, 3)
  assert.ok(hooks[0].includes('Senate passes budget bill'))
  const caps = makeCaptions('Senate passes budget bill', 'https://news.test/a')
  assert.deepEqual(caps.map((c) => c.platform), ['TikTok', 'Instagram', 'X', 'YouTube Shorts'])
  assert.ok(caps.find((c) => c.platform === 'Instagram')!.text.includes('https://news.test/a'))
})

test('wrap limits lines and adds an ellipsis when truncated', () => {
  const lines = wrap('one two three four five six seven eight nine ten eleven twelve', 12, 2)
  assert.equal(lines.length, 2)
  assert.ok(lines[1].endsWith('…'))
})

test('card SVG escapes user text', () => {
  const svg = cardSvg('<script>alert(1)</script>', 'politics', 42)
  assert.ok(!svg.includes('<script>'))
  assert.ok(svg.includes('&lt;script&gt;'))
  assert.ok(svg.includes('Trend score 42/100'))
})
