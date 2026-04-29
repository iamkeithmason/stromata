export type Tradition = {
  id: number
  slug: string
  name: string
}

export type Era = {
  id: number
  slug: string
  label: string
  year_start: number | null
  year_end: number | null
  description: string | null
}

export type Genre = {
  id: number
  slug: string
  name: string
  description: string
}

export type Theme = {
  id: number
  slug: string
  name: string
  cluster: string
}

export type Author = {
  id: string
  name: string
  birth_year: number | null
  death_year: number | null
  era_id: number | null
  tradition_id: number
  bio: string | null
  bio_source: string | null
  copyright_safe: boolean
  created_at: string
  updated_at: string
}

export type AuthorLocation = {
  id: string
  author_id: string
  historical_name: string
  modern_name: string | null
  period_start: number | null
  period_end: number | null
  latitude: number | null
  longitude: number | null
  sort_order: number
}

export type Text = {
  id: string
  title: string
  slug: string
  author_id: string
  genre_id: number
  body: string
  source_attribution: string | null
  provenance_notes: string | null
  translation_notes: string | null
  ocr_quality: 'high' | 'medium' | 'low' | null
  published: boolean
  created_at: string
  updated_at: string
}

export type TextTheme = {
  text_id: string
  theme_id: number
}
