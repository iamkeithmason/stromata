export const TRADITIONS = [
  // Ordered roughly chronologically — early through to modern.
  // seoTitle targets research-intent queries rather than tradition name alone
  // (bare tradition names attract liturgical calendar / community traffic).
  { slug: 'early-church',        name: 'Early Church (pre-Nicene)',  seoTitle: 'Early Church writings' },
  { slug: 'patristic',           name: 'Patristic',                  seoTitle: 'Patristic theology texts' },
  { slug: 'byzantine',           name: 'Byzantine',                  seoTitle: 'Byzantine Christian writings' },
  { slug: 'oriental-orthodox',   name: 'Oriental Orthodox',          seoTitle: 'Oriental Orthodox Christian texts' },
  { slug: 'eastern-orthodox',    name: 'Eastern Orthodox',           seoTitle: 'Eastern Orthodox Christian writings' },
  { slug: 'roman-catholic',      name: 'Roman Catholic',             seoTitle: 'Medieval Catholic writings' },
  { slug: 'anglican',            name: 'Anglican',                   seoTitle: 'Anglican devotional texts' },
  { slug: 'reformed',            name: 'Reformed',                   seoTitle: 'Reformed theology texts' },
  { slug: 'lutheran',            name: 'Lutheran',                   seoTitle: 'Lutheran theology texts' },
  { slug: 'radical-reformation', name: 'Radical Reformation',        seoTitle: 'Radical Reformation writings' },
  { slug: 'methodist',           name: 'Methodist',                  seoTitle: 'Methodist devotional writings' },
  { slug: 'ecumenical',          name: 'Ecumenical',                 seoTitle: 'Ecumenical Christian writings' },
]

export const ERAS = [
  { slug: 'apostolic', label: 'Apostolic (to c. 100)' },
  { slug: 'ante-nicene', label: 'Ante-Nicene (c. 100–325)' },
  { slug: 'nicene-post-nicene', label: 'Nicene & Post-Nicene (325–600)' },
  { slug: 'early-medieval', label: 'Early Medieval (600–1000)' },
  { slug: 'high-medieval', label: 'High Medieval (1000–1350)' },
  { slug: 'late-medieval', label: 'Late Medieval (1350–1500)' },
  { slug: 'reformation', label: 'Reformation (1500–1600)' },
  { slug: 'post-reformation', label: 'Post-Reformation (1600–1800)' },
  { slug: 'modern', label: 'Modern (1800–1900)' },
]

export const GENRES = [
  { slug: 'homily', name: 'Homily' },
  { slug: 'sermon', name: 'Sermon' },
  { slug: 'letter', name: 'Letter' },
  { slug: 'treatise', name: 'Treatise' },
  { slug: 'essay', name: 'Essay' },
  { slug: 'meditation', name: 'Meditation' },
  { slug: 'rule', name: 'Rule' },
  { slug: 'prayer', name: 'Prayer' },
  { slug: 'catechesis', name: 'Catechesis' },
  { slug: 'commentary', name: 'Commentary' },
  { slug: 'dialogue', name: 'Dialogue' },
  { slug: 'hymn', name: 'Hymn' },
  { slug: 'confession', name: 'Confession' },
  { slug: 'hagiography', name: 'Hagiography' },
  { slug: 'apology', name: 'Apology' },
  { slug: 'exegesis', name: 'Exegesis' },
]

export const THEME_CLUSTERS = [
  {
    cluster: 'The Interior Life',
    themes: [
      { slug: 'prayer', name: 'Prayer' },
      { slug: 'repentance', name: 'Repentance' },
      { slug: 'contemplation', name: 'Contemplation' },
      { slug: 'humility', name: 'Humility' },
      { slug: 'suffering', name: 'Suffering' },
      { slug: 'spiritual-warfare', name: 'Spiritual Warfare' },
      { slug: 'desire', name: 'Desire' },
      { slug: 'rest', name: 'Rest' },
    ],
  },
  {
    cluster: 'The Christian Life',
    themes: [
      { slug: 'vocation', name: 'Vocation' },
      { slug: 'community', name: 'Community' },
      { slug: 'hospitality', name: 'Hospitality' },
      { slug: 'fasting', name: 'Fasting' },
      { slug: 'poverty', name: 'Poverty' },
      { slug: 'obedience', name: 'Obedience' },
      { slug: 'marriage', name: 'Marriage' },
      { slug: 'work', name: 'Work' },
    ],
  },
  {
    cluster: 'Doctrine',
    themes: [
      { slug: 'trinity', name: 'Trinity' },
      { slug: 'christology', name: 'Christology' },
      { slug: 'pneumatology', name: 'Pneumatology' },
      { slug: 'salvation', name: 'Salvation' },
      { slug: 'eschatology', name: 'Eschatology' },
      { slug: 'creation', name: 'Creation' },
      { slug: 'scripture', name: 'Scripture' },
      { slug: 'providence', name: 'Providence' },
    ],
  },
  {
    cluster: 'The Church',
    themes: [
      { slug: 'liturgy', name: 'Liturgy' },
      { slug: 'sacraments', name: 'Sacraments' },
      { slug: 'ministry', name: 'Ministry' },
      { slug: 'monasticism', name: 'Monasticism' },
      { slug: 'preaching', name: 'Preaching' },
      { slug: 'tradition', name: 'Tradition' },
    ],
  },
  {
    cluster: 'Moral & Ethical',
    themes: [
      { slug: 'justice', name: 'Justice' },
      { slug: 'virtue', name: 'Virtue' },
      { slug: 'vice', name: 'Vice' },
      { slug: 'death', name: 'Death' },
      { slug: 'conscience', name: 'Conscience' },
    ],
  },
]
