-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- LOOKUP TABLES (controlled vocabularies)
-- ============================================================

CREATE TABLE traditions (
  id   SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

INSERT INTO traditions (slug, name) VALUES
  ('early-church',        'Early Church (pre-Nicene)'),
  ('patristic',           'Patristic'),
  ('eastern-orthodox',    'Eastern Orthodox'),
  ('roman-catholic',      'Roman Catholic'),
  ('anglican',            'Anglican'),
  ('reformed',            'Reformed'),
  ('lutheran',            'Lutheran'),
  ('radical-reformation', 'Radical Reformation'),
  ('methodist',           'Methodist'),
  ('ecumenical',          'Ecumenical');


CREATE TABLE eras (
  id         SERIAL PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  year_start INT,
  year_end   INT
);

INSERT INTO eras (slug, label, year_start, year_end) VALUES
  ('apostolic',          'Apostolic',               NULL, 100),
  ('ante-nicene',        'Ante-Nicene',              100,  325),
  ('nicene-post-nicene', 'Nicene & Post-Nicene',     325,  600),
  ('early-medieval',     'Early Medieval',           600,  1000),
  ('high-medieval',      'High Medieval',            1000, 1350),
  ('late-medieval',      'Late Medieval',            1350, 1500),
  ('reformation',        'Reformation',              1500, 1600),
  ('post-reformation',   'Post-Reformation',         1600, 1800),
  ('modern',             'Modern',                   1800, 1900);


CREATE TABLE genres (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL
);

INSERT INTO genres (slug, name, description) VALUES
  ('homily',       'Homily',       'A sermon or preached exposition, usually on a scriptural passage'),
  ('sermon',       'Sermon',       'A formal preached address; distinct from homily in register or occasion'),
  ('letter',       'Letter',       'Epistolary correspondence, personal or encyclical'),
  ('treatise',     'Treatise',     'Extended doctrinal or theological argument'),
  ('essay',        'Essay',        'Sustained argument addressed to a general educated reader, typically on theology''s relationship to culture, society, or public life'),
  ('meditation',   'Meditation',   'Reflective, devotional prose not primarily argumentative'),
  ('rule',         'Rule',         'A monastic or communal rule of life'),
  ('prayer',       'Prayer',       'A composed prayer or prayer text'),
  ('catechesis',   'Catechesis',   'Instructional text for formation or teaching'),
  ('commentary',   'Commentary',   'Sustained exegetical engagement with a scriptural text'),
  ('dialogue',     'Dialogue',     'A text structured as conversation or disputation'),
  ('hymn',         'Hymn',         'A poetic or liturgical text composed for singing or chanting'),
  ('confession',   'Confession',   'A personal or creedal profession of faith; includes autobiographical confessional writing'),
  ('hagiography',  'Hagiography',  'A life of a saint or holy person'),
  ('apology',      'Apology',      'A formal defence of the faith addressed to outsiders or critics'),
  ('exegesis',     'Exegesis',     'A shorter or more focused scriptural interpretation than a full commentary');


CREATE TABLE themes (
  id      SERIAL PRIMARY KEY,
  slug    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  cluster TEXT NOT NULL
);

INSERT INTO themes (slug, name, cluster) VALUES
  -- The Interior Life
  ('prayer',           'Prayer',           'The Interior Life'),
  ('repentance',       'Repentance',        'The Interior Life'),
  ('contemplation',    'Contemplation',     'The Interior Life'),
  ('humility',         'Humility',          'The Interior Life'),
  ('suffering',        'Suffering',         'The Interior Life'),
  ('spiritual-warfare','Spiritual Warfare', 'The Interior Life'),
  ('desire',           'Desire',            'The Interior Life'),
  ('rest',             'Rest',              'The Interior Life'),
  -- The Christian Life
  ('vocation',         'Vocation',          'The Christian Life'),
  ('community',        'Community',         'The Christian Life'),
  ('hospitality',      'Hospitality',       'The Christian Life'),
  ('fasting',          'Fasting',           'The Christian Life'),
  ('poverty',          'Poverty',           'The Christian Life'),
  ('obedience',        'Obedience',         'The Christian Life'),
  ('marriage',         'Marriage',          'The Christian Life'),
  ('work',             'Work',              'The Christian Life'),
  -- Doctrine
  ('trinity',          'Trinity',           'Doctrine'),
  ('christology',      'Christology',       'Doctrine'),
  ('pneumatology',     'Pneumatology',      'Doctrine'),
  ('salvation',        'Salvation',         'Doctrine'),
  ('eschatology',      'Eschatology',       'Doctrine'),
  ('creation',         'Creation',          'Doctrine'),
  ('scripture',        'Scripture',         'Doctrine'),
  ('providence',       'Providence',        'Doctrine'),
  -- The Church
  ('liturgy',          'Liturgy',           'The Church'),
  ('sacraments',       'Sacraments',        'The Church'),
  ('ministry',         'Ministry',          'The Church'),
  ('monasticism',      'Monasticism',       'The Church'),
  ('preaching',        'Preaching',         'The Church'),
  ('tradition',        'Tradition',         'The Church'),
  -- Moral & Ethical
  ('justice',          'Justice',           'Moral & Ethical'),
  ('virtue',           'Virtue',            'Moral & Ethical'),
  ('vice',             'Vice',              'Moral & Ethical'),
  ('death',            'Death',             'Moral & Ethical'),
  ('conscience',       'Conscience',        'Moral & Ethical');


-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE authors (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT        NOT NULL,
  birth_year    INT,
  death_year    INT,
  era_id        INT         REFERENCES eras(id),
  tradition_id  INT         NOT NULL REFERENCES traditions(id),
  bio           TEXT,
  bio_source    TEXT,
  -- Auto-derived: safe to publish if author died before 1900 (UK copyright: life + 70 yrs)
  copyright_safe BOOLEAN GENERATED ALWAYS AS (
    death_year IS NULL OR death_year < 1900
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE author_locations (
  id             UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id      UUID  NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  historical_name TEXT NOT NULL,
  modern_name    TEXT,
  period_start   INT,
  period_end     INT,
  latitude       FLOAT,
  longitude      FLOAT,
  sort_order     INT   NOT NULL DEFAULT 0
);

CREATE TABLE texts (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               TEXT        NOT NULL,
  slug                TEXT        NOT NULL UNIQUE,
  author_id           UUID        NOT NULL REFERENCES authors(id),
  genre_id            INT         NOT NULL REFERENCES genres(id),
  body                TEXT        NOT NULL,
  source_attribution  TEXT,
  provenance_notes    TEXT,
  translation_notes   TEXT,
  ocr_quality         TEXT        CHECK (ocr_quality IN ('high', 'medium', 'low')),
  published           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE text_themes (
  text_id  UUID NOT NULL REFERENCES texts(id)  ON DELETE CASCADE,
  theme_id INT  NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  PRIMARY KEY (text_id, theme_id)
);


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authors_updated_at
  BEFORE UPDATE ON authors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER texts_updated_at
  BEFORE UPDATE ON texts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
