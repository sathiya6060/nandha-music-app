// Cover sizing regression: an <img> width/height attribute maps to a
// DEFINITE height hint, which beats `aspect-ratio` — without
// `height: auto` the box renders as a stretched strip (Home cards were
// 134px wide x 800px tall on the 27 Nov 2026 live build). These tests
// fail if the rule ever loses `height: auto` again.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../styles/theme.css', import.meta.url), 'utf-8')

function ruleBody(selector) {
  const start = css.indexOf(selector)
  expect(start, `${selector} rule missing from theme.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('cover sizing (aspect-ratio needs height: auto)', () => {
  it.each(['.track-card__cover', '.detail-head__cover'])(
    '%s keeps height: auto so aspect-ratio: 1 sizes the box square',
    (selector) => {
      const body = ruleBody(selector)
      expect(body).toMatch(/aspect-ratio:\s*1/)
      expect(body).toMatch(/height:\s*auto/)
    },
  )

  // Same bug family, no aspect-ratio involved: the EPK cover img carries
  // width/height 3000 attributes, so with only `max-width: 100%` the
  // width capped to its grid cell while the height stayed 3000px.
  it('.epk-photo keeps height: auto so attribute-sized art scales down', () => {
    expect(ruleBody('.epk-photo')).toMatch(/height:\s*auto/)
  })
})
