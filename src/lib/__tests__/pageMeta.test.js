// Per-route meta URLs (S7) — absoluteUrl() unit tests.
import { describe, it, expect } from 'vitest'
import { absoluteUrl, DEFAULT_IMAGE, SITE_URL } from '../pageMeta.js'

describe('absoluteUrl', () => {
  it('absolutizes a relative cover path against the live site', () => {
    expect(absoluteUrl('/assets/vaazhvinil-cover-800.webp')).toBe(
      `${SITE_URL}/assets/vaazhvinil-cover-800.webp`,
    )
  })

  it('handles a path without a leading slash', () => {
    expect(absoluteUrl('assets/vaazhvinil-cover.jpg')).toBe(
      `${SITE_URL}/assets/vaazhvinil-cover.jpg`,
    )
  })

  it('passes an absolute URL through unchanged', () => {
    const url = 'https://cdn.example.com/cover.jpg'
    expect(absoluteUrl(url)).toBe(url)
  })

  it('falls back to the default OG image when there is no cover', () => {
    expect(absoluteUrl()).toBe(DEFAULT_IMAGE)
    expect(absoluteUrl('')).toBe(DEFAULT_IMAGE)
    expect(absoluteUrl(null)).toBe(DEFAULT_IMAGE)
  })

  it('the site URL is the live Cloudflare Pages domain', () => {
    expect(SITE_URL).toBe('https://nandhamusic.pages.dev')
    expect(DEFAULT_IMAGE).toBe(`${SITE_URL}/assets/vaazhvinil-cover.jpg`)
  })
})
