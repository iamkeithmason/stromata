# Product Requirements Document: The Stromata

**Date:** March 2026  
**Status:** Draft v2  
**Author:** Keith (with Claude)  
**Input sources:** Conversation context, prior site experience, editorial intent

---

## Problem statement

Serious Christians and students of church history have no well-curated, freely accessible digital library of out-of-print theological texts organised by tradition, theme, and era. What exists is either scattered across the web in inconsistent quality, locked behind paywalls, or published without editorial coherence. The Stromata existed to solve this — and can do so again, more durably.

---

## Background

The Stromata ran previously as a WordPress site publishing out-of-print Christian texts organised by theme, tradition, and author. It had user accounts, bookmarking, highlighting, and Wikipedia-sourced author bios. It was retired when a plugin update broke the site and time pressures (young family) made recovery impossible.

The conditions that killed it — WordPress plugin dependency, no time for maintenance, manual OCR cleanup — have changed. AI tooling now makes OCR correction and content processing far less labour-intensive. Claude Code removes the need for WordPress-style abstraction layers. The editorial work, which is the real differentiator, is now the primary time cost, and that suits the founder's skillset.

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

## Requirements

### MVP (Phase 1)

**Must have**
- Static or near-static text rendering — fast, readable, minimal JS overhead
- Texts organised by: tradition, era, theme, and author
- Author profile pages (name, tradition, dates, location, brief bio)
- Clean, readable typography optimised for long-form reading
- Mobile-friendly layout
- Donation prompt (non-intrusive)
- Admin interface for adding and editing texts (not public-facing)
- Basic search across titles and authors

**Should have**
- Wikipedia bio integration (pulled and cached, not live-fetched)
- Text source attribution and provenance notes
- Thematic index (cross-tradition topics: prayer, repentance, ecclesiology, etc.)
- RSS or simple subscription for new additions

**Won't have in MVP**
- User accounts
- Highlighting or annotation
- Comments
- Full-text search within documents
- API

---

### Phase 2: Reading experience

**Must have**
- User accounts (email/password, simple)
- Bookmarking texts
- Reading progress tracking

**Should have**
- Highlighting with personal notes
- "Reading lists" — user-curated collections
- Basic annotation export (plain text or markdown)

**Won't have in Phase 2**
- Social features (sharing annotations publicly, following other users)
- Native app

---

### Phase 3: Discovery and depth

**Must have**
- Full-text search within documents
- Related texts (by theme, tradition, author era)
- Curated reading paths (e.g. "Introduction to the Desert Fathers", "Anglican Spiritual Classics")

**Should have**
- OCR-sourced texts flagged with quality confidence
- Suggested corrections workflow (user flags errors, admin reviews)
- Optional email digest — new texts by tradition or theme

**Could have**
- API access for researchers
- Print-optimised PDF export of texts
- Public reading lists (opt-in)

---

## Data model and taxonomy

### Author (the primary organisational anchor)

Authors carry the metadata that texts inherit. A text does not need its own tradition or era field — it derives these from its author.

| Field | Type | Notes |
|---|---|---|
| Name | String | Display name |
| Dates | Integer pair | Birth/death years; approximate values permitted |
| Era | String (controlled) | Derived from dates; human-readable label |
| Tradition | String (controlled) | See list below |
| Locations | Array | Multiple allowed; each has a historical name, modern name, and approximate period |
| Bio | Text | Wikipedia-seeded, editorially reviewed and cached locally |
| Copyright status | Derived | Auto-flagged based on death date vs cutoff rules |

**Location handling:** Authors can be associated with multiple locations to reflect movement (e.g. Augustine: Thagaste → Carthage → Milan → Hippo). Each location stores both its historical name and modern equivalent. The map view plots all associated locations.

---

### Tradition (controlled vocabulary)

- Early Church (pre-Nicene)
- Patristic
- Eastern Orthodox
- Roman Catholic
- Anglican
- Reformed
- Lutheran
- Radical Reformation
- Methodist
- Ecumenical *(for figures genuinely hard to categorise)*

---

### Era (controlled vocabulary)

Derived from author death date but stored as a human-readable label for display and filtering.

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

### Genre / Form (controlled vocabulary, 16 terms)

What kind of writing is this? Applies at the text level.

| Term | Description |
|---|---|
| Homily | A sermon or preached exposition, usually on a scriptural passage |
| Sermon | A formal preached address; distinct from homily in register or occasion |
| Letter | Epistolary correspondence, personal or encyclical |
| Treatise | Extended doctrinal or theological argument (e.g. Augustine's *On the Trinity*) |
| Essay | Sustained argument addressed to a general educated reader, typically on theology's relationship to culture, society, or public life |
| Meditation | Reflective, devotional prose not primarily argumentative |
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

### Themes (controlled vocabulary, ~40 terms)

Flat tags applied at the text level. Suggested by AI during cleanup workflow, confirmed by editor. Organised here in clusters for reference — displayed as a flat index on the site.

**The Interior Life**
Prayer, Repentance, Contemplation, Humility, Suffering, Spiritual Warfare, Desire, Rest

**The Christian Life**
Vocation, Community, Hospitality, Fasting, Poverty, Obedience, Marriage, Work

**Doctrine**
Trinity, Christology, Pneumatology, Salvation, Eschatology, Creation, Scripture, Providence

**The Church**
Liturgy, Sacraments, Ministry, Monasticism, Preaching, Tradition

**Moral & Ethical**
Justice, Virtue, Vice, Death, Conscience

---

### Copyright policy

- **Hard cutoff:** Author death date must be pre-1900 for inclusion without additional rights clearance.
- **Rationale:** UK copyright term is life + 70 years. Pre-1900 death date provides a clean, safe harbour for a UK-based site with a global audience.
- **US note:** Pre-1928 publication is generally safe in the US; the death-date rule is stricter and covers both jurisdictions adequately.
- **Workflow flag:** During OCR cleanup, Claude will flag any text where the author's death date is post-1899, note the copyright expiry year under UK law, and recommend exclusion unless rights are verified.
- **Translations:** Where the original is public domain but the translation is not, the translation must be independently out of copyright or explicitly licensed. Flag for editorial review.

---



- **Time:** Founder is a full-time principal design manager with four children including a newborn. Build sessions will be irregular. Architecture must tolerate long gaps between development attention.
- **Maintenance:** Zero tolerance for plugin-style dependency chains. Any framework chosen must prioritise stability over feature velocity.
- **Technical:** Built with Claude Code assistance. Stack should be chosen for longevity and low operational overhead. Preference for managed hosting (Vercel, Railway, Render, or similar) to avoid server administration.
- **Content:** Texts are out-of-print and public domain or verified permissible. OCR source material exists. Cleanup is now AI-assisted.
- **Financial:** Free to access. Donation-funded. No VC, no monetisation pressure. Hosting costs must be minimal at low traffic volumes.

---

## Stack recommendation (for Claude Code sessions)

| Layer | Recommendation | Rationale |
|---|---|---|
| Framework | Next.js (App Router) | Stable, excellent static generation, large ecosystem, good for content-heavy sites |
| Database | PostgreSQL via Supabase | Managed, generous free tier, handles auth in Phase 2 |
| CMS / Admin | Custom lightweight admin route or Payload CMS | Avoids WordPress dependency hell |
| Hosting | Vercel | Zero-config deploys, stable, pairs well with Next.js |
| Search (MVP) | Postgres full-text search | No additional service needed until scale demands it |
| Search (Phase 3) | Algolia or Typesense | If full-text within documents becomes priority |
| Auth (Phase 2) | Supabase Auth | Already in stack, handles email/password cleanly |

---

## Content workflow

1. Source scan or existing digital text
2. Run through AI (Claude) for OCR cleanup and formatting
   - Copyright flag: author death date checked against pre-1900 cutoff
   - Translation copyright checked separately if applicable
   - AI suggests theme tags from controlled vocabulary
3. Editorial review — accuracy, provenance, formatting consistency, tag confirmation
4. Structured entry via admin: author record (if new), genre, themes, source attribution
5. Publish via admin interface
6. Periodic audit for quality, broken links, and taxonomy drift

---

## Success metrics

- **Phase 1:** Site live with ≥20 texts across ≥4 traditions. Readable on mobile. Admin can add a new text in under 15 minutes.
- **Phase 2:** User account system working. Bookmarking and highlighting functional. Zero data loss on deploy.
- **Phase 3:** Full-text search working. At least one curated reading path published. Donation received from a non-acquaintance.

**Longer term:** The site should feel like a library, not a startup. Success is a resource that persists, grows slowly, and is used by people who'd otherwise go without.

---

## Key tensions and open questions

- **Static vs dynamic:** A fully static site (e.g. Astro) would be maximally stable and cheap, but makes Phase 2 user accounts harder. Next.js with static generation for public pages and dynamic routes for auth is a reasonable middle ground — worth committing to early.
- **OCR quality threshold:** At what quality level does a text get published vs held back? A visible quality confidence flag on each text may be better than a hard threshold — lets users know what they're reading.
- **Tradition scope:** *(Resolved)* Pan-Christian in intent, with an honest English skew based on editorial familiarity. Named as such rather than fought against. The map view will naturally surface geographic gaps over time.
- **Scope of "out of print":** *(Resolved)* Pre-1900 author death date is the cutoff. Translations require independent copyright clearance. No exceptions without verified rights.
- **Thematic taxonomy:** *(Resolved)* Controlled vocabulary of ~40 terms, organised in clusters, applied as flat tags. AI-assisted suggestion during cleanup workflow, confirmed by editor.

---

## Recommended next steps

1. **Decide stack** *(in progress)* — Next.js + Supabase + Vercel confirmed as direction
2. **Draft thematic taxonomy** *(complete)* — see Data model section above
3. **Identify 20 seed texts** — enough to make Phase 1 meaningful; aim for ≥4 traditions and ≥4 eras
4. **First Claude Code session** — scaffold the project, set up repo, generate database schema from this PRD, deploy skeleton to Vercel
5. **OCR cleanup workflow** — test AI-assisted cleanup and copyright flagging on 2-3 texts before committing at scale
