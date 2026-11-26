// M1 — cover variants: cards/player get the 800px WebP, OG keeps the original.
import { describe, it, expect } from 'vitest'
import { cardCoverUrl, ogCoverUrl } from '../coverUrl.js'

describe('cardCoverUrl', () => {
  it('maps the seeded 3000px JPG to its 800px WebP sibling', () => {
    expect(cardCoverUrl('/assets/vaazhvinil-cover.jpg')).toBe('/assets/vaazhvinil-cover-800.webp')
  })

  it('leaves .webp covers unchanged', () => {
    expect(cardCoverUrl('/assets/vaazhvinil-cover-800.webp')).toBe('/assets/vaazhvinil-cover-800.webp')
  })

  it('leaves Supabase covers-bucket URLs unchanged (already downscaled at upload)', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/covers/x-123.webp'
    expect(cardCoverUrl(url)).toBe(url)
  })

  it('returns null for a missing cover', () => {
    expect(cardCoverUrl(null)).toBeNull()
    expect(cardCoverUrl('')).toBeNull()
  })
})

describe('ogCoverUrl', () => {
  it('keeps the original full-size cover for OG/social', () => {
    expect(ogCoverUrl('/assets/vaazhvinil-cover.jpg')).toBe('/assets/vaazhvinil-cover.jpg')
    expect(ogCoverUrl(null)).toBeNull()
  })
})
