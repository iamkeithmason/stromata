import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { SITE_URL } from '@/lib/metadata'
import { COLOPHON, type DownloadableText, type DownloadableCollection } from '@/lib/downloads'
import { parseMarkdownBlocks, type Block, type Run } from '@/lib/pdf/markdown'

// Purpose-built PDF layout using @react-pdf's standard Times fonts (no font
// files to bundle). Aims for a plain, printable book page — the majority-world
// print/redistribution use case that justified this feature.

const FOOTER = 'The Stromata · thestromata.com — freely reproducible for personal, educational, and ministry use.'

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 64,
    fontFamily: 'Times-Roman',
    fontSize: 11.5,
    lineHeight: 1.5,
    color: '#1b1b1b',
  },
  kicker: {
    fontFamily: 'Times-Italic',
    fontSize: 9,
    color: '#6f6a60',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: { fontFamily: 'Times-Bold', fontSize: 22, lineHeight: 1.15, marginBottom: 6 },
  author: { fontFamily: 'Times-Italic', fontSize: 13, color: '#3a3a3a', marginBottom: 4 },
  meta: { fontSize: 9, color: '#6f6a60', marginBottom: 2 },
  accession: { fontSize: 8, color: '#9c9589', letterSpacing: 1 },
  colophon: {
    fontFamily: 'Times-Italic',
    fontSize: 9,
    color: '#6f6a60',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#d8d2c6',
  },
  rule: { borderBottomWidth: 0.5, borderBottomColor: '#d8d2c6', marginVertical: 14 },
  h1: { fontFamily: 'Times-Bold', fontSize: 16, marginTop: 16, marginBottom: 6 },
  h2: { fontFamily: 'Times-Bold', fontSize: 13.5, marginTop: 14, marginBottom: 5 },
  h3: { fontFamily: 'Times-Bold', fontSize: 12, marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 9, textAlign: 'justify' },
  blockquote: {
    fontFamily: 'Times-Italic',
    color: '#3a3a3a',
    marginBottom: 9,
    marginLeft: 16,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#d8d2c6',
  },
  li: { marginBottom: 5, marginLeft: 14, flexDirection: 'row' },
  liBullet: { width: 12 },
  liBody: { flex: 1 },
  sectionLabel: {
    fontFamily: 'Times-Italic',
    fontSize: 9,
    color: '#6f6a60',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 10,
    marginBottom: 6,
  },
  provenance: {
    fontSize: 8.5,
    color: '#6f6a60',
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#d8d2c6',
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 64,
    right: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#9c9589',
  },
})

const eraName = (label?: string | null) => label?.replace(/\s*\(.*?\)/, '').trim() || null
const accession = (n?: number | null) => (n == null ? null : `STROMATA № ${String(n).padStart(2, '0')}`)

function familyFor(r: Run): string {
  if (r.bold && r.italic) return 'Times-BoldItalic'
  if (r.bold) return 'Times-Bold'
  if (r.italic) return 'Times-Italic'
  return 'Times-Roman'
}

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text key={i} style={{ fontFamily: familyFor(r) }}>
          {r.text}
        </Text>
      ))}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'hr') return <View key={i} style={styles.rule} />
        if (b.type === 'li') {
          return (
            <View key={i} style={styles.li}>
              <Text style={styles.liBullet}>•</Text>
              <Text style={styles.liBody}>
                <Runs runs={b.runs} />
              </Text>
            </View>
          )
        }
        const style =
          b.type === 'h1' ? styles.h1
          : b.type === 'h2' ? styles.h2
          : b.type === 'h3' ? styles.h3
          : b.type === 'blockquote' ? styles.blockquote
          : styles.p
        return (
          <Text key={i} style={style}>
            <Runs runs={b.runs} />
          </Text>
        )
      })}
    </>
  )
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{FOOTER}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// @react-pdf's automatic within-a-Page pagination (measuring one flowing Yoga
// tree and slicing it into physical pages at render time) corrupts its own
// layout math once a single <Page> element overflows past roughly ten to
// thirteen physical pages — it throws `unsupported number: -2.3e+21` from
// pdfkit's transform call, reliably, on any long text (reproduced locally: a
// ~9,000-word body already fails). Splitting the content into many explicit
// <Page> elements up front — each holding a small, bounded slice of blocks —
// keeps every individual Page's own overflow small enough to dodge the bug,
// and rendered a 96,000-word body across 114 pages without error where the
// single-Page version failed at 9 pages. Chunk size is deliberately well
// under the observed ~10-page failure threshold.
const BLOCKS_PER_PAGE = 8

function chunkBlocks(blocks: Block[], size: number): Block[][] {
  if (blocks.length === 0) return [[]]
  const chunks: Block[][] = []
  for (let i = 0; i < blocks.length; i += size) chunks.push(blocks.slice(i, i + size))
  return chunks
}

// The header + body of one text, split across one or more physical <Page>s so
// that no single Page's automatic pagination has to absorb the whole text.
// Usable both as a standalone document's pages and as one section within a
// collection document.
function TextPages({ text, showColophon }: { text: DownloadableText; showColophon: boolean }) {
  const authorName = text.author?.name ?? null
  const metaParts = [text.author?.tradition?.name, eraName(text.author?.era?.label), text.genre?.name].filter(
    Boolean
  ) as string[]
  const provenance = [
    text.source_attribution ? `Source: ${text.source_attribution}` : null,
    text.provenance_notes,
    text.translation_notes ? `Translation: ${text.translation_notes}` : null,
  ].filter(Boolean) as string[]

  const introBlocks = text.editorial_introduction ? parseMarkdownBlocks(text.editorial_introduction) : []
  const bodyBlocks = parseMarkdownBlocks(text.body)
  const contentBlocks: Block[] = [...introBlocks, ...(introBlocks.length > 0 ? [{ type: 'hr' } as Block] : []), ...bodyBlocks]
  const pages = chunkBlocks(contentBlocks, BLOCKS_PER_PAGE)

  return (
    <>
      {pages.map((pageBlocks, i) => (
        <Page key={i} size="A4" style={styles.page}>
          {i === 0 && (
            <>
              <Text style={styles.title}>{text.title}</Text>
              {authorName && <Text style={styles.author}>{authorName}</Text>}
              {metaParts.length > 0 && <Text style={styles.meta}>{metaParts.join('  ·  ')}</Text>}
              {accession(text.accession_number) && (
                <Text style={styles.accession}>{accession(text.accession_number)}</Text>
              )}
              {showColophon && <Text style={styles.colophon}>{COLOPHON}</Text>}
              <View style={styles.rule} />
              {introBlocks.length > 0 && <Text style={styles.sectionLabel}>Introduction</Text>}
            </>
          )}

          <Blocks blocks={pageBlocks} />

          {i === pages.length - 1 && provenance.length > 0 && (
            <View style={styles.provenance}>
              {provenance.map((line, pi) => (
                <Text key={pi}>{line}</Text>
              ))}
              <Text>{`${SITE_URL}/texts/${text.slug}`}</Text>
            </View>
          )}

          <Footer />
        </Page>
      ))}
    </>
  )
}

export function TextDocument({ text }: { text: DownloadableText }) {
  return (
    <Document title={text.title} author={text.author?.name ?? undefined}>
      <TextPages text={text} showColophon />
    </Document>
  )
}

export function CollectionDocument({
  collection,
  texts,
}: {
  collection: DownloadableCollection
  texts: DownloadableText[]
}) {
  const authorName = collection.author?.name ?? null
  return (
    <Document title={collection.title} author={authorName ?? undefined}>
      {/* Collection cover page */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Collection</Text>
        <Text style={styles.title}>{collection.title}</Text>
        {authorName && <Text style={styles.author}>{authorName}</Text>}
        <Text style={styles.meta}>{texts.length} texts</Text>
        <Text style={styles.colophon}>{COLOPHON}</Text>
        {collection.description && (
          <>
            <View style={styles.rule} />
            <Text style={styles.p}>{collection.description}</Text>
          </>
        )}
        <View style={styles.rule} />
        <Text style={styles.sectionLabel}>Contents</Text>
        {texts.map((t, i) => (
          <Text key={t.slug} style={{ marginBottom: 3, marginLeft: 8 }}>
            {`${i + 1}.  ${t.title}`}
          </Text>
        ))}
        <Footer />
      </Page>

      {/* One or more page-break-delimited pages per text */}
      {texts.map(text => (
        <TextPages key={text.slug} text={text} showColophon={false} />
      ))}
    </Document>
  )
}
