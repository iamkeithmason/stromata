import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { TRADITIONS, ERAS, GENRES } from '@/lib/pipeline/vocab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// source_type inference from a URL (mirrors CLAUDE.md's rules).
function inferSourceType(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('gutenberg.org')) return 'gutenberg'
  if (u.includes('wikisource.org')) return 'wikisource'
  if (u.includes('archive.org') && (u.includes('djvu.txt') || u.includes('/stream/'))) return 'archive_ocr'
  if (u.includes('archive.org')) return 'archive_online'
  if (u.includes('newadvent.org')) return 'archive_ocr' // /fathers/ URLs are broken — OCR fallback
  return 'archive_online'
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-')
}

function suggestSlug(title: string, author: string): string {
  const surname = slugify((author || '').split(/\s+/).filter(Boolean).pop() || '')
  const shortTitle = slugify((title || '').split(/\s+/).slice(0, 4).join(' '))
  return [shortTitle, surname].filter(Boolean).join('-')
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Block obvious SSRF targets — this route fetches a user-supplied URL.
function isBlockedHost(host: string): boolean {
  return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
}

const SYSTEM = `You are a research assistant for a curated library of PUBLIC-DOMAIN Christian theological texts.
Given a source web page, extract bibliographic metadata and assess whether the text is safe to use on
copyright grounds. Be conservative: US public-domain rule of thumb is that the WORK's author died before
1900 OR the specific English TRANSLATION was published before 1929. Modern (post-1928) translations of
older works are typically STILL IN COPYRIGHT even though the original is ancient — flag these as HOLD.

Return ONLY a single JSON object, no prose, with these keys:
{
  "author": string,                     // original author's display name
  "death_year": number | null,          // author's year of death if known
  "title": string,                      // the work's title (clean, no underscores)
  "tradition": string,                  // one slug from the TRADITIONS list, or ""
  "era": string,                        // one slug from the ERAS list, or ""
  "genre": string,                      // one name from the GENRES list, or ""
  "translator": string,                 // translator name if this is a translation, else ""
  "translator_death_year": number | null,
  "translation_year": number | null,    // year the translation was published, if stated/known
  "verdict": "SAFE" | "HOLD",           // SAFE only if clearly public domain
  "reasoning": string                   // 1-3 sentences: the copyright basis, and any uncertainty
}
TRADITIONS (slug): ${TRADITIONS.map(t => t.slug).join(', ')}
ERAS (slug): ${ERAS.map(e => e.slug).join(', ')}
GENRES (name): ${GENRES.join(', ')}
If a field is unknown, use "" or null — never guess a death year you don't actually know. When unsure about
copyright, choose HOLD.`

export async function POST(request: NextRequest) {
  let url: string
  try {
    url = (await request.json()).url
  } catch {
    return NextResponse.json({ error: 'Body must be JSON { url }' }, { status: 400 })
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (!/^https?:$/.test(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'URL must be a public http(s) address.' }, { status: 400 })
  }

  // Fetch the page.
  let pageText: string
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (StromataPipeline)' }, redirect: 'follow' })
    if (!res.ok) return NextResponse.json({ error: `Source returned HTTP ${res.status}` }, { status: 502 })
    const raw = await res.text()
    pageText = htmlToText(raw).slice(0, 12000)
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch URL: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 502 })
  }

  // Ask Claude to extract + assess.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let modelJson: Record<string, unknown>
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Source URL: ${url}\n\nPage text (truncated):\n${pageText}` }],
    })
    const text = (message.content[0] as { text: string }).text
    const slice = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    modelJson = JSON.parse(slice)
  } catch (err) {
    return NextResponse.json({ error: `Analysis failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 502 })
  }

  const title = String(modelJson.title ?? '').trim()
  const author = String(modelJson.author ?? '').trim()
  const slug = suggestSlug(title, author)
  const translationYear = typeof modelJson.translation_year === 'number' ? (modelJson.translation_year as number) : null

  // Draft prospect for the human to confirm — never auto-accepted.
  const prospect = {
    id: slug,
    status: 'pending',
    author,
    death_year: typeof modelJson.death_year === 'number' ? modelJson.death_year : null,
    tradition: TRADITIONS.some(t => t.slug === modelJson.tradition) ? (modelJson.tradition as string) : '',
    era: ERAS.some(e => e.slug === modelJson.era) ? (modelJson.era as string) : '',
    title,
    genre: GENRES.includes(modelJson.genre as (typeof GENRES)[number]) ? (modelJson.genre as string) : '',
    source_type: inferSourceType(url),
    source_url: url,
    collection_slug: slug,
    translator: String(modelJson.translator ?? '').trim(),
    translator_death_year: typeof modelJson.translator_death_year === 'number' ? modelJson.translator_death_year : null,
    // Pre-tick copyright-clear only when the model is confident it's a pre-1929
    // translation; the human still reviews the verdict before importing.
    translation_copyright_clear: modelJson.verdict === 'SAFE' && !!translationYear && translationYear < 1929,
    notes: translationYear ? `Translation year (per source): ${translationYear}.` : '',
  }

  return NextResponse.json({
    prospect,
    verdict: modelJson.verdict === 'SAFE' ? 'SAFE' : 'HOLD',
    reasoning: String(modelJson.reasoning ?? '').trim(),
  })
}
