import { describe, expect, it } from 'vitest'
import { foldForSearch, trackMatchesQuery, transliterateTamil } from '../searchMatch.js'

// The one real catalog track (same shape the app uses).
const TRACK = {
  id: 'vaazhvinil-orumurayenum',
  titleEn: 'Vaazhvinil Orumurayenum',
  titleTa: 'வாழ்வினில் ஒருமுறையேனும்',
  album: 'Annamalaiyar',
  artist: 'Nandha Music',
  composer: 'Siddha Guruji',
  genre: 'Devotional',
  status: 'published',
}

describe('transliterateTamil', () => {
  it('transliterates வாழ்வினில்', () => {
    expect(transliterateTamil('வாழ்வினில்')).toBe('vaazhvinil')
  })

  it('handles the pulli: சுற்றிவர -> surrivara', () => {
    expect(transliterateTamil('சுற்றிவர')).toBe('surrivara')
  })

  it('passes Latin text through unchanged', () => {
    expect(transliterateTamil('Vaazhvinil')).toBe('Vaazhvinil')
  })

  it('handles the precomposed rounded vowels ொ / ோ', () => {
    expect(transliterateTamil('கொ')).toBe('ko')
    expect(transliterateTamil('கோ')).toBe('koo')
  })
})

describe('foldForSearch', () => {
  it('folds a Tamil query and its Latin spelling to the same string', () => {
    expect(foldForSearch('வாழ்வினில்')).toBe(foldForSearch('Vaazhvinil'))
    expect(foldForSearch('வாழ்வினில்')).toBe('valvinil')
  })

  it('is case- and diacritic-insensitive', () => {
    expect(foldForSearch('Vāazhvinil')).toBe(foldForSearch('vaazhvinil'))
    expect(foldForSearch('VAAZHVINIL')).toBe('valvinil')
  })

  it('converges the ch/sh/zh romanization variants', () => {
    expect(foldForSearch('chivan')).toBe(foldForSearch('sivan'))
    expect(foldForSearch('shivan')).toBe(foldForSearch('sivan'))
    expect(foldForSearch('vaazhvinil')).toBe(foldForSearch('valvinil'))
  })

  it('returns empty for empty input', () => {
    expect(foldForSearch('')).toBe('')
    expect(foldForSearch(null)).toBe('')
  })

  // M37: separators and punctuation fold away on both sides.
  it('folds a pasted slug to the spaced title form', () => {
    expect(foldForSearch('vaazhvinil-orumurayenum')).toBe(
      foldForSearch('Vaazhvinil Orumurayenum'),
    )
    expect(foldForSearch('vaazhvinil_orumurayenum')).toBe(
      foldForSearch('Vaazhvinil Orumurayenum'),
    )
  })

  it('drops trailing punctuation', () => {
    expect(foldForSearch('vaazhvinil!')).toBe('valvinil')
    expect(foldForSearch('vaazhvinil?')).toBe('valvinil')
    expect(foldForSearch('vaazhvinil.')).toBe('valvinil')
    expect(foldForSearch('(vaazhvinil)')).toBe('valvinil')
  })
})

describe('trackMatchesQuery (item 10)', () => {
  it('matches a Latin query against the Latin title', () => {
    expect(trackMatchesQuery(TRACK, 'vaazhvinil')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'orumurayenum')).toBe(true)
  })

  it('matches a Tamil query against the Tamil title', () => {
    expect(trackMatchesQuery(TRACK, 'வாழ்வினில்')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'ஒருமுறையேனும்')).toBe(true)
  })

  it('matches a Latin query against the Tamil title shown on cards', () => {
    // 'valvinil' is the folded form of both the Tamil and Latin titles.
    expect(trackMatchesQuery(TRACK, 'valvinil')).toBe(true)
  })

  it('matches album, artist and composer', () => {
    expect(trackMatchesQuery(TRACK, 'annamalaiyar')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'nandha')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'siddha')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'devotional')).toBe(true)
  })

  it('does not match unrelated queries', () => {
    expect(trackMatchesQuery(TRACK, 'marakka')).toBe(false)
    expect(trackMatchesQuery(TRACK, 'xyz')).toBe(false)
  })

  it('an empty query matches (same as before)', () => {
    expect(trackMatchesQuery(TRACK, '')).toBe(true)
  })

  // M37: pasted slugs / URLs and punctuated queries must match.
  it('matches a pasted hyphenated slug', () => {
    expect(trackMatchesQuery(TRACK, 'vaazhvinil-orumurayenum')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'vaazhvinil_orumurayenum')).toBe(true)
  })

  it('matches a query with trailing punctuation', () => {
    expect(trackMatchesQuery(TRACK, 'vaazhvinil!')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'vaazhvinil?')).toBe(true)
    expect(trackMatchesQuery(TRACK, 'Vaazhvinil,')).toBe(true)
  })

  it('matches via the slug field even when the id is a UUID', () => {
    const uuidTrack = {
      ...TRACK,
      id: '485b5cdc-0a86-4501-be2d-90b64a3a3657',
      slug: 'marakka-mudiyuma',
      titleEn: 'Marakka Mudiyuma',
      titleTa: 'மறக்க முடியுமா?',
    }
    expect(trackMatchesQuery(uuidTrack, 'marakka-mudiyuma')).toBe(true)
    expect(trackMatchesQuery(uuidTrack, 'marakka mudiyuma')).toBe(true)
  })

  it('does not match an unrelated slug', () => {
    expect(trackMatchesQuery(TRACK, 'malaiyoram-veesiya-kaatre')).toBe(false)
  })
})
