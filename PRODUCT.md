# Product Requirements Document: The Stromata

**Date:** April 2026  
**Status:** Draft v3 — Phase 1 in progress  
**Author:** Keith (with Claude)

---

## Problem statement

Serious Christians and students of church history have no well-curated, freely accessible digital library of out-of-print theological texts organised by tradition, theme, and era. What exists is either scattered across the web in inconsistent quality, locked behind paywalls, or published without editorial coherence. The Stromata existed to solve this — and can do so again, more durably.

---

## Background

The Stromata ran previously as a WordPress site publishing out-of-print Christian texts organised by theme, tradition, and author. It was retired when a plugin update broke the site and time pressures (young family) made recovery impossible.

The conditions that killed it have changed. AI tooling now makes OCR correction and content processing far less labour-intensive. Claude Code removes the need for WordPress-style abstraction layers. The editorial work — which is the real differentiator — is now the primary time cost, and that suits the founder's skillset.

A comparable service has emerged commercially. The Stromata's advantage is curatorial depth, theological coherence of organisation, and open access.

---

## Users

**Primary: Theologically curious lay readers**  
Want to read patristic and historical Christian texts without needing institutional library access. Care about readability and discoverability. Frustrated by poor scan quality, inconsistent formatting, and texts scattered across academic repositories.

**Secondary: Students and independent researchers**  
Want to bookmark, annotate, and return to texts. May be working across traditions — patristic, medieval, Reformed, Anglican, Orthodox. Need reliable text quality and clear source attribution.

**Tertiary: Clergy and spiritual directors**  
Looking for devotional and formative texts to recommend or draw from. Value brevity and thematic organisation over exhaustive coverage.

---

## Phase 1 build status

### Infrastructure — complete

- [x] Next.js 15 App Router, TypeScript, Tailwind CSS
- [x] Supabase (PostgreSQL) — schema, migrations, server/client wrappers
- [x] Vercel deployment with environment variables
- [x] Admin authentication (single password, JWT HttpOnly cookie, middleware protection)
- [x] `dev.sh` clean-restart script

### Database schema — complete

- [x] `traditions` — 10 controlled values
- [x] `eras` — 9 controlled values with year ranges
- [x] `genres` — 16 controlled values
- [x] `themes` — ~40 terms in 5 clusters
- [x] `authors` — name, dates, tradition, era, bio, bio_source, slug, copyright_safe (generated), created/updated
- [x] `texts` — title, slug, author, genre, body (markdown), source attribution, provenance notes, translation notes, OCR quality, published, accession_number, collection_id, collection_order
- [x] `text_themes` — junction table
- [x] `collections` — title, slug, author, description, published
- [x] `author_locations` — schema exists (author, historical name, modern name, coordinates, period); not yet wired into admin or public pages

### Admin interface — complete

- [x] Dashboard — authors, collections, texts listed with status; success messages
- [x] **Authors:** create with Wikipedia lookup (auto-fills dates, tradition, bio); edit
- [x] **Texts:** create and edit with markdown editor (write/preview tabs, formatting guide); OCR quality; themes; source attribution; provenance and translation notes; publish toggle
- [x] **Collections/series:** create and edit; link texts to a collection with explicit position ordering
- [x] **Duplicate workflow:** any text can be duplicated — all metadata pre-filled, position auto-incremented, title/body left blank for new content
- [x] **Accession numbers:** each text assigned a permanent № on creation, displayed on book covers and text reader footer

### Public pages — complete

- [x] Homepage — book covers (Penguin-classics style with linen texture, accession number, author date, genre), theme cluster index with entry counts, search bar
- [x] `/texts` — library index
- [x] `/texts/[slug]` — text reader with markdown rendering, OCR quality notices, collection breadcrumb and prev/next navigation, accession number in footer
- [x] `/authors` — authors index
- [x] `/authors/[slug]` — author detail with bio, texts, themes
- [x] `/collections/[slug]` — collection page listing texts in order
- [x] `/search` — search across titles and author names

---

## Phase 1 — remaining work

These items are required before Phase 1 can be considered complete and the site opened for general use.

### Must complete before launch

**Content**
- [ ] **20 seed texts** across at least 4 traditions and 4 eras — the Phase 1 success metric; without this the site cannot launch meaningfully
- [ ] At least one collection fully populated (e.g. Lady Jane Grey letters) as a demonstration of that feature

**Pages**
- [ ] **About page** (`/about`) — editorial statement, scope, copyright policy, how texts are selected; essential for credibility and search indexing
- [ ] **Donation prompt** — non-intrusive; footer of text pages is the natural placement; a single sentence with a link is sufficient for Phase 1

**Taxonomy**
- [ ] **Tradition revision** — migrate from the current 10-term list to the revised 11-term list (adds Byzantine, Oriental Orthodox; clarifies Early Church / Patristic split). This should happen before the library grows further, while author counts are still small. See migration notes in the taxonomy section below.

### Should complete before launch

**Discovery**
- [ ] **`/texts` and `/authors` index filtering** — sort or filter by tradition, era, genre; currently lists everything unfiltered; fine at 20 texts, needed at 50+
- [ ] **Theme pages** (`/themes/[slug]`) — currently clicking a theme tag runs a search; a proper theme page (with intro text and text list) is more durable and indexable
- [ ] **RSS feed** — a simple feed of new texts; low effort, serves the "return visitor" use case

**Admin**
- [ ] **Author locations** — `author_locations` table exists but is not wired into admin forms or public author pages; the map view is a Phase 2+ feature but the data entry is worth enabling now while authors are being added

### Won't have in Phase 1

- User accounts
- Bookmarking or reading progress
- Highlighting or annotation
- Full-text search within documents
- Map view (depends on author locations data)
- Comments or corrections workflow
- API

---

## Phase 2 — reading experience

*Sequence not fixed — depends on what Phase 1 usage patterns reveal.*

**Must have**
- [ ] User accounts (email/password via Supabase Auth)
- [ ] Bookmarking texts
- [ ] Reading progress tracking

**Should have**
- [ ] Highlighting with personal notes
- [ ] Reading lists — user-curated collections (distinct from the editorial collections above)
- [ ] Basic annotation export (plain text or markdown)

**Won't have in Phase 2**
- Social features (sharing annotations publicly, following other users)
- Native app

---

## Phase 3 — discovery and depth

**Must have**
- [ ] Full-text search within documents (Postgres tsvector is already in the stack — no new service needed)
- [ ] Related texts (by theme, tradition, author era)
- [ ] Curated reading paths (e.g. "Introduction to the Desert Fathers", "Anglican Spiritual Classics")
- [ ] Map view — authors plotted by location and period, using `author_locations` data

**Should have**
- [ ] OCR correction workflow — users flag errors, admin reviews
- [ ] Optional email digest — new texts by tradition or theme
- [ ] Author chronology view — texts arranged visually by date and tradition

**Could have**
- [ ] API access for researchers
- [ ] Print-optimised PDF export
- [ ] Public reading lists (opt-in)

---

## Data model and taxonomy

### Author

| Field | Type | Notes |
|---|---|---|
| Name | String | Display name |
| Slug | String | URL identifier; auto-generated from name |
| Dates | Integer pair | Birth/death years; approximate values permitted |
| Era | String (controlled) | Selected from controlled list; can override date-derived value |
| Tradition | String (controlled) | See list below |
| Bio | Text | Wikipedia-seeded on creation, cached locally, editorially reviewed |
| Bio source | Text | e.g. "Wikipedia, cached 2026-04-17" |
| Copyright safe | Derived boolean | death_year < 1900 OR death_year IS NULL |
| Locations | Array (separate table) | Multiple per author; historical name, modern name, coordinates, period |

### Text

| Field | Type | Notes |
|---|---|---|
| Title | String | |
| Slug | String | Unique URL identifier; auto-generated, editable |
| Accession number | Integer | Permanent sequential №; assigned on creation, never changes |
| Author | FK → authors | |
| Genre | FK → genres | |
| Themes | FK → text_themes | Multiple |
| Collection | FK → collections | Optional; with ordering position |
| Body | Markdown text | Rendered with full heading/blockquote/emphasis support |
| Source attribution | String | |
| Provenance notes | Text | |
| Translation notes | Text | Translation copyright status if applicable |
| OCR quality | Enum | high / medium / low; shown as reader notice if medium or low |
| Published | Boolean | Draft by default |

### Collection

| Field | Type | Notes |
|---|---|---|
| Title | String | e.g. "Letters of Lady Jane Grey" |
| Slug | String | URL identifier |
| Author | FK → authors | Optional; leave blank for multi-author collections |
| Description | Text | Editorial introduction to the collection |
| Published | Boolean | Controls visibility of the collection page |

Texts within a collection carry a `collection_order` integer. The collection page lists them in that order; the text reader shows prev/next navigation within the sequence.

---

### Tradition (controlled vocabulary)

> **Active list** — 10 terms currently in use. A revised 11-term list is documented below and should be migrated to before the library exceeds ~30 authors.

**Current working list**
- Early Church (pre-Nicene)
- Patristic
- Eastern Orthodox
- Roman Catholic
- Anglican
- Reformed
- Lutheran
- Radical Reformation
- Methodist
- Ecumenical

---

**Pending revision** *(migration required — see notes)*

Problems with the current list:
1. Calling Athanasius or the Cappadocians "Eastern Orthodox" or "Roman Catholic" is historically wrong — those identities don't exist until after the Great Schism (1054). "Patristic" papers over this.
2. Oriental Orthodox (Coptic, Syriac, Armenian, Ethiopian) is entirely absent. Ephrem the Syrian is a natural Stromata figure.

**Revised list:**

| Term | Period | Representative figures |
|---|---|---|
| Early Church | to c. 325 | Ignatius, Justin Martyr, Origen, Tertullian |
| Patristic | c. 325–600 | Augustine, Chrysostom, the Cappadocians, Ambrose, Jerome |
| Byzantine | c. 600–1054 | Maximus the Confessor, John of Damascus, Bede, Gregory the Great |
| Oriental Orthodox | All eras (Coptic, Syriac, Armenian, Ethiopian) | Ephrem the Syrian, Shenoute of Atripe |
| Eastern Orthodox | post-1054 | |
| Roman Catholic | post-1054 | |
| Anglican | from c. 1530 | |
| Reformed | from c. 1520 | |
| Lutheran | from c. 1517 | |
| Radical Reformation | c. 1520–1700 | |
| Methodist | from c. 1740 | |
| Ecumenical | Figures genuinely resistant to categorisation | |

**Migration notes:**
- Current "Early Church" entries: review — some belong under "Patristic" or "Byzantine" depending on dates
- Current "Patristic" entries dated post-600: move to "Byzantine"
- Current "Eastern Orthodox" and "Roman Catholic" entries dated pre-1054: move to "Patristic" or "Byzantine"
- Update the Wikipedia tradition-suggestion logic in `NewAuthorForm.tsx` (`suggestTradition` function) to recognise the new terms

**On liminal figures:** Writers like Wycliffe and Hus operate within Roman Catholic structures while prefiguring Reformation concerns. Assign the most historically accurate label (Roman Catholic for Wycliffe) and note the tension in the bio.

---

### Era (controlled vocabulary)

| Label | Approximate range |
|---|---|
| Apostolic | to c. 100 |
| Ante-Nicene | c. 100–325 |
| Nicene & Post-Nicene | 325–600 |
| Early Medieval | 600–1000 |
| High Medieval | 1000–1350 |
| Late Medieval | 1350–1500 |
| Reformation | 1500–1600 |
| Post-Reformation | 1600–1800 |
| Modern | 1800–1900 |

---

### Tradition × Era validity matrix

*(Current working matrix — matches active tradition list)*

| Tradition | Apostolic | Ante-Nicene | Nicene & Post-Nicene | Early Medieval | High Medieval | Late Medieval | Reformation | Post-Reformation | Modern |
|---|---|---|---|---|---|---|---|---|---|
| Early Church | ✓ | ✓ | | | | | | | |
| Patristic | ✓ | ✓ | ✓ | ✓ | | | | | |
| Eastern Orthodox | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Roman Catholic | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Anglican | | | | | | | ✓ | ✓ | ✓ |
| Reformed | | | | | | | ✓ | ✓ | ✓ |
| Lutheran | | | | | | | ✓ | ✓ | ✓ |
| Radical Reformation | | | | | | | ✓ | ✓ | |
| Methodist | | | | | | | | ✓ | ✓ |
| Ecumenical | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

*(Revised matrix to replace the above after tradition migration — see taxonomy section)*

---

### Editorial priority weights

For gap-scoring and curatorial focus. These are editorial judgments, not algorithmic outputs.

| Tradition | Priority | Notes |
|---|---|---|
| Early Church | High | |
| Patristic | High | |
| Byzantine | High | Distinct and underrepresented in English-language libraries |
| Oriental Orthodox | Medium | Sparse by nature; valuable where it exists |
| Eastern Orthodox | Medium | |
| Roman Catholic | High | Medieval Latin tradition especially |
| Anglican | High | Core editorial identity |
| Reformed | Medium | |
| Lutheran | Medium | |
| Methodist | Low | |
| Radical Reformation | Low | |
| Ecumenical | Low | Not a priority to fill |

*Medieval era texts (High and Late Medieval) score a priority bonus regardless of tradition — underrepresented in freely available digital libraries and central to The Stromata's curatorial purpose.*

---

### Genre (16 terms)

| Term | Description |
|---|---|
| Homily | A sermon or preached exposition, usually on a scriptural passage |
| Sermon | A formal preached address; distinct from homily in register or occasion |
| Letter | Epistolary correspondence, personal or encyclical |
| Treatise | Extended doctrinal or theological argument |
| Essay | Sustained argument addressed to a general educated reader |
| Meditation | Reflective, devotional prose; not primarily argumentative |
| Rule | A monastic or communal rule of life |
| Prayer | A composed prayer or prayer text |
| Catechesis | Instructional text for formation or teaching |
| Commentary | Sustained exegetical engagement with a scriptural text |
| Dialogue | A text structured as conversation or disputation |
| Hymn | A poetic or liturgical text composed for singing or chanting |
| Confession | A personal or creedal profession of faith; includes autobiographical confessional writing |
| Hagiography | A life of a saint or holy person |
| Apology | A formal defence of the faith addressed to outsiders or critics |
| Exegesis | A shorter or more focused scriptural interpretation than a full commentary |

---

### Themes (~40 terms, 5 clusters)

**The Interior Life:** Prayer, Repentance, Contemplation, Humility, Suffering, Spiritual Warfare, Desire, Rest

**The Christian Life:** Vocation, Community, Hospitality, Fasting, Poverty, Obedience, Marriage, Work

**Doctrine:** Trinity, Christology, Pneumatology, Salvation, Eschatology, Creation, Scripture, Providence

**The Church:** Liturgy, Sacraments, Ministry, Monasticism, Preaching, Tradition

**Moral & Ethical:** Justice, Virtue, Vice, Death, Conscience

---

### Copyright policy

- **Hard cutoff:** Author death date must be pre-1900.
- **Rationale:** UK copyright term is life + 70 years. Pre-1900 death date provides a clean safe harbour for a UK-based site with a global audience.
- **US note:** Pre-1928 publication is generally safe in the US; the death-date rule covers both adequately.
- **Translations:** Where the original is public domain but the translation is not, the translation must be independently out of copyright or explicitly licensed.
- **Implementation:** `copyright_safe` is a generated boolean column on `authors` (death_year < 1900 OR death_year IS NULL). OCR cleanup workflow should flag any author where this is false.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Deployed and working |
| Database | PostgreSQL via Supabase | Deployed and working |
| Hosting | Vercel | Deployed and working |
| Admin auth | Single password + JWT cookie (jose) | No external auth library |
| Search (Phase 1) | Postgres ilike on title + author name | Working |
| Search (Phase 3) | Postgres tsvector | Already in stack, no new service needed |
| Auth (Phase 2) | Supabase Auth | Already in stack |

---

## Content workflow

1. Source scan or existing digital text
2. Run through Claude for OCR cleanup and formatting
   - Copyright check: author death date vs pre-1900 cutoff
   - Translation copyright checked separately if applicable
   - Claude suggests theme tags from controlled vocabulary
3. Editorial review — accuracy, provenance, formatting consistency, tag confirmation
4. Admin entry:
   - If new author: create author record (Wikipedia lookup auto-fills dates, tradition, bio)
   - Create text: genre, themes, collection assignment, source attribution
   - If part of a series: use Duplicate to copy metadata, change title and body, set position
5. Publish via admin interface
6. Periodic audit for quality and taxonomy consistency

---

## Constraints

- **Time:** Founder is a full-time principal design manager with four children including a newborn. Build sessions will be irregular. Architecture must tolerate long gaps between development attention.
- **Maintenance:** Zero tolerance for plugin-style dependency chains.
- **Financial:** Free to access. Donation-funded. No VC, no monetisation pressure. Hosting costs minimal at low traffic.

---

## Success metrics

- **Phase 1:** Site live with ≥20 texts across ≥4 traditions. Readable on mobile. Admin can add a new text in under 10 minutes. Donation link present.
- **Phase 2:** User account system working. Bookmarking and highlighting functional. Zero data loss on deploy.
- **Phase 3:** Full-text search working. At least one curated reading path published. Donation received from a non-acquaintance.

**Longer term:** The site should feel like a library, not a startup. Success is a resource that persists, grows slowly, and is used by people who'd otherwise go without.

---

## Analytics Events (Umami)

| Event | Attributes | Status |
|-------|------------|--------|
| `collection-nav` | `direction` (prev/next/end), `collection` (title) | Implemented |

---

## Immediate next steps (to reach Phase 1 launch)

Priority order:

1. **Tradition taxonomy migration** — do this now, before more authors are added; small change while author count is low
2. **About page** — `/about` with editorial statement, scope, copyright policy
3. **Donation prompt** — single line + link in text reader footer; no payment processing needed
4. **Seed content** — 20 texts across ≥4 traditions; use the duplicate workflow for multi-letter collections
5. **Mobile pass** — verify all public pages on a phone
6. **RSS feed** — simple, low effort, high value for return readers
7. **Soft launch** — share with a small group; gather feedback before wider promotion
