import Link from 'next/link'

export const metadata = {
  title: 'About — The Stromata',
  description:
    'The Stromata is a freely accessible library of out-of-print Christian texts, organised by author, tradition, era, and theme.',
}

export default function AboutPage() {
  return (
    <div style={{ background: '#FBF8F1' }} className="min-h-screen">
      <header
        className="border-b bg-white px-8 py-5 flex justify-between items-center"
        style={{ borderColor: '#e5e0d8' }}
      >
        <Link href="/" className="font-serif text-sm hover:opacity-70 transition-opacity" style={{ color: '#6f6a60' }}>
          The Stromata
        </Link>
        <div className="hidden sm:flex gap-6 text-sm" style={{ color: '#6f6a60' }}>
          <Link href="/authors" className="hover:text-stone-900 transition-colors">Authors</Link>
          <Link href="/texts" className="hover:text-stone-900 transition-colors">Library</Link>
          <Link href="/about" className="hover:text-stone-900 transition-colors" style={{ color: '#1b1b1b' }}>About</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">

        <h1 className="font-serif text-3xl mb-10" style={{ color: '#1b1b1b' }}>
          About The Stromata
        </h1>

        <div className="font-serif leading-loose space-y-6 text-base" style={{ color: '#1b1b1b' }}>

          <p>
            The Stromata is a freely accessible library of out-of-print Christian texts — homilies,
            letters, meditations, treatises — organised by author, tradition, era, and theme.
            Everything here is written by someone who has been dead for more than a century, which
            means it is free to read, free to share, and free to stay that way.
          </p>

          <p>
            The writers gathered here — from Justin Martyr in the second century to the Reformers,
            from Augustine to the Anglican divines — are often described as "the Fathers" or "the
            tradition" in ways that make them feel remote. They were not. They were working pastors
            and careful theologians, monks who wrote about prayer and repentance from lives given
            entirely to both, bishops who shepherded communities through plague, invasion, and the
            collapse of empires. Their writing is direct, often surprising, and more contemporary in
            feeling than the centuries between us would suggest. The Stromata exists to make their
            work easier to find and more pleasurable to read.
          </p>

        </div>

        {/* Section: Who it's for */}
        <div className="mt-12 mb-6">
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>
        <h2 className="font-serif text-lg mb-5" style={{ color: '#1b1b1b' }}>Who it&rsquo;s for</h2>
        <div className="font-serif leading-loose space-y-6 text-base" style={{ color: '#1b1b1b' }}>
          <p>
            You don&rsquo;t need a seminary degree to read these texts, and The Stromata
            doesn&rsquo;t assume you have one. The site is organised to help readers who know
            they&rsquo;re interested but aren&rsquo;t sure where to start — by theme (prayer,
            repentance, the Trinity), by tradition (patristic, Anglican, Reformed, Orthodox), or
            simply by browsing. The goal is a site that is catechetical by design: one that helps
            you understand who these writers were and why they might matter, not just where to find
            their words.
          </p>
        </div>

        {/* Section: What's here */}
        <div className="mt-12 mb-6">
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>
        <h2 className="font-serif text-lg mb-5" style={{ color: '#1b1b1b' }}>What&rsquo;s here and what isn&rsquo;t</h2>
        <div className="font-serif leading-loose space-y-6 text-base" style={{ color: '#1b1b1b' }}>
          <p>
            The library is deliberately selective. Every author died before 1900 — this gives a
            clean safe harbour for copyright and keeps the scope manageable. The selection skews
            Anglican and patristic, reflecting the editor&rsquo;s own reading life, though the
            intent is pan-Christian. Texts are entered one by one, editorially reviewed, and marked
            with their source and provenance. Where a scan was used for digitisation, the quality is
            noted on the text itself.
          </p>
          <p>
            This is a small library, and it is growing slowly. That is by design.
          </p>
        </div>

        {/* Section: Personal note */}
        <div className="mt-12 mb-6">
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>
        <h2 className="font-serif text-lg mb-5" style={{ color: '#1b1b1b' }}>A personal note</h2>
        <div className="font-serif leading-loose space-y-6 text-base" style={{ color: '#1b1b1b' }}>
          <p>
            The Stromata was founded by Keith Mason. I started reading patristic texts as a teenager
            — not because anyone asked me to, but because I found them strange and alive in a way
            that surprised me. Years went by. I moved into technology, working mainly in and around
            startups, and the two parts of my life sat apart from each other. I kept noticing that a
            lot of this material was technically available online but practically inaccessible:
            scattered, poorly presented, on sites that felt long-abandoned. I thought I could do
            something about that — not just typographically, but editorially. A site that helped
            readers who were new to these writers find their way in.
          </p>
          <p>
            I ran an earlier version on WordPress. When I became a parent — I now have four children,
            the youngest a newborn — the maintenance overhead became impossible and the site quietly
            went offline. The technology has changed enough that I&rsquo;ve been able to rebuild it
            in a way that sits alongside a full life rather than competing with it. That&rsquo;s
            what this is.
          </p>
        </div>

        {/* Section: Support */}
        <div className="mt-12 mb-6">
          <hr style={{ borderColor: '#1b1b1b', borderTopWidth: '1px' }} />
        </div>
        <h2 className="font-serif text-lg mb-5" style={{ color: '#1b1b1b' }}>Support the library</h2>
        <div className="font-serif leading-loose space-y-6 text-base" style={{ color: '#1b1b1b' }}>
          <p>
            The Stromata is free to read and always will be. It has no advertising, no subscription,
            and no institutional funding. If you find it useful and would like to support its
            continuation, even a small contribution helps with hosting and keeps the editorial work
            going.
          </p>
          <p>
            <a
              href="https://ko-fi.com/stromata"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:opacity-70 transition-opacity"
              style={{ color: '#1b1b1b' }}
            >
              Support on Ko-fi →
            </a>
          </p>
        </div>

      </main>

      <footer
        className="border-t px-8 py-8 text-center mt-8"
        style={{ borderColor: '#e5e0d8' }}
      >
        <p className="text-xs" style={{ color: '#6f6a60' }}>
          The Stromata — freely accessible texts from the Christian tradition
        </p>
        <p className="text-xs mt-2">
          <a
            href="/rss"
            className="hover:opacity-70 transition-opacity"
            style={{ color: '#c8c3bb' }}
          >
            RSS feed
          </a>
        </p>
      </footer>
    </div>
  )
}
