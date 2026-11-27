// Tamil + Latin search matching (item 10, 27 Nov 2026).
//
// The old matcher was plain toLowerCase + includes, so a Tamil query
// never matched a Latin title and a Latin query never matched a Tamil
// title — even though every track carries both. This module folds
// both sides the same way before comparing:
//
//   1. Tamil script is transliterated to Latin (abugida-aware: the
//      inherent 'a' of each consonant, vowel signs, pulli).
//   2. Diacritics are stripped (NFD), everything lowercases.
//   3. Romanization variants converge: ch/sh -> s, zh -> l
//      ('சிவன்' is typed sivan, chivan and shivan; 'ழ' is zh or l).
//   4. Vowel length collapses (aa -> a, ee -> e, …): 'vaazhvinil',
//      'vazvinil' and 'வாழ்வினில்' all fold to the same string.
//
// Matching is still substring (includes) over the folded text, so
// behaviour for plain English queries is unchanged — only recall
// grows. Recent searches are untouched (this only changes matching).
const VOWELS = {
  'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ii', 'உ': 'u', 'ஊ': 'uu',
  'எ': 'e', 'ஏ': 'ee', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'oo', 'ஔ': 'au',
}

const VOWEL_SIGNS = {
  'ா': 'aa', 'ி': 'i', 'ீ': 'ii', 'ு': 'u', 'ூ': 'uu',
  'ெ': 'e', 'ே': 'ee', 'ை': 'ai', 'ொ': 'o', 'ோ': 'oo', 'ௌ': 'au',
}

// Consonants carry an inherent 'a' (k -> 'ka'); the pulli (்)
// removes it, a vowel sign replaces it.
const CONSONANTS = {
  'க': 'k', 'ங': 'ng', 'ச': 's', 'ஞ': 'nj', 'ட': 't', 'ண': 'n',
  'த': 't', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r',
  'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n',
  'ஶ': 's', 'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h',
}

const PULLI = '்' // U+0BCD
const AYTAM = 'ஃ' // U+0B83 -> 'h'

/** Tamil script -> Latin letters (ISO-15919-ish). Latin text passes through. */
export function transliterateTamil(text) {
  if (!text) return ''
  const chars = [...String(text)]
  // Syllables: { cons, vowel } — a consonant starts with vowel 'a',
  // a sign replaces it, a pulli clears it, an independent vowel
  // stands alone (cons '').
  const syllables = []
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    if (CONSONANTS[ch]) {
      syllables.push({ cons: CONSONANTS[ch], vowel: 'a' })
    } else if (VOWELS[ch]) {
      syllables.push({ cons: '', vowel: VOWELS[ch] })
    } else if (VOWEL_SIGNS[ch]) {
      // Two-code-point forms of the rounded vowels: ெ + ா = ொ (o),
      // ே + ா = ோ (oo). The precomposed single code points above are
      // what well-formed Tamil uses; this only covers the split form.
      if (ch === 'ெ' && chars[i + 1] === 'ா') {
        if (syllables.length > 0) syllables[syllables.length - 1].vowel = 'o'
        i += 1
      } else if (ch === 'ே' && chars[i + 1] === 'ா') {
        if (syllables.length > 0) syllables[syllables.length - 1].vowel = 'oo'
        i += 1
      } else if (syllables.length > 0) {
        syllables[syllables.length - 1].vowel = VOWEL_SIGNS[ch]
      } else {
        syllables.push({ cons: '', vowel: VOWEL_SIGNS[ch] })
      }
    } else if (ch === PULLI) {
      if (syllables.length > 0) syllables[syllables.length - 1].vowel = ''
    } else if (ch === AYTAM) {
      syllables.push({ cons: '', vowel: 'h' })
    } else {
      // Latin letters, digits, spaces, punctuation: pass through as
      // their own syllable so they survive the join unchanged.
      syllables.push({ cons: ch, vowel: '' })
    }
  }
  return syllables.map((s) => s.cons + s.vowel).join('')
}

/** One canonical form for a query or a catalog field. */
export function foldForSearch(text) {
  if (!text) return ''
  let s = transliterateTamil(String(text))
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  s = s.toLowerCase()
  // Romanization variants converge.
  s = s.replace(/ch/g, 's').replace(/sh/g, 's').replace(/zh/g, 'l')
  // Vowel length is typed loosely.
  s = s.replace(/aa/g, 'a').replace(/ee/g, 'e').replace(/ii/g, 'i')
    .replace(/oo/g, 'o').replace(/uu/g, 'u')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * True when the folded query appears in any folded catalog field
 * (Tamil title, Latin title, album, artist, composer, genre).
 * An empty query matches everything, as before.
 */
export function trackMatchesQuery(track, query) {
  const q = foldForSearch(query)
  if (!q) return true
  const fields = [
    track?.titleEn, track?.titleTa, track?.album,
    track?.artist, track?.composer, track?.genre,
  ]
  return fields.some((field) => foldForSearch(field).includes(q))
}
