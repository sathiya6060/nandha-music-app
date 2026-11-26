// Nandha Music — cover variants (M1 — OpenCodeReview, 27 Nov 2026).
//
// S9 generated an 800px WebP for the seeded cover
// (/assets/vaazhvinil-cover-800.webp, ~119 KB vs the 1.5 MB 3000px JPG)
// but only the static fallback used it: the Supabase path passed the
// stored cover_url straight through, so every card and the player
// downloaded the full 3000px file.
//
// Rules:
// - Cards / player / lists use cardCoverUrl(): the 800px WebP sibling
//   for local /assets covers. Admin-uploaded covers are already
//   downscaled to 800px WebP at upload time (supabaseAdmin.js
//   uploadCover), so Supabase covers bucket URLs pass through
//   unchanged — they ARE the small variant.
// - OG / social sharing uses ogCoverUrl(): the original (3000px JPG)
//   for scrapers, which want the largest image.
// - Invariant: every local cover shipped under /assets must have a
//   `-800.webp` sibling (same basename). Today exactly one local cover
//   exists (vaazhvinil-cover.jpg) and its sibling is verified present.
//   If a local cover ever ships without a sibling, this maps to a 404
//   — do not add local covers without generating the variant.

/** Small variant for cards/player. Leaves non-local and .webp URLs alone. */
export function cardCoverUrl(cover) {
  if (!cover || typeof cover !== 'string') return cover || null
  if (!cover.startsWith('/assets/')) return cover
  if (/\.webp$/i.test(cover)) return cover
  const m = cover.match(/^(.*)\.(jpe?g|png)$/i)
  if (!m) return cover
  return `${m[1]}-800.webp`
}

/** Original (full-size) cover for OG/social — never the small variant. */
export function ogCoverUrl(cover) {
  return cover || null
}
