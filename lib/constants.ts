export const TRADITIONS = [
  // Ordered roughly chronologically — early through to modern
  { slug: 'early-church',        name: 'Early Church (pre-Nicene)' },  // to c. 325
  { slug: 'patristic',           name: 'Patristic' },                  // c. 325–600
  { slug: 'byzantine',           name: 'Byzantine' },                  // c. 600–1054 (East & Latin West, undivided)
  { slug: 'oriental-orthodox',   name: 'Oriental Orthodox' },          // Coptic, Syriac, Armenian, Ethiopian — all eras
  { slug: 'eastern-orthodox',    name: 'Eastern Orthodox' },           // post-1054
  { slug: 'roman-catholic',      name: 'Roman Catholic' },             // post-1054 (medieval Latin church)
  { slug: 'anglican',            name: 'Anglican' },                   // from c. 1530
  { slug: 'reformed',            name: 'Reformed' },                   // from c. 1520
  { slug: 'lutheran',            name: 'Lutheran' },                   // from c. 1517
  { slug: 'radical-reformation', name: 'Radical Reformation' },        // c. 1520–1700
  { slug: 'methodist',           name: 'Methodist' },                  // from c. 1740
  { slug: 'ecumenical',          name: 'Ecumenical' },                 // figures genuinely resistant to categorisation
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
